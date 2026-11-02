import { envelopeProblem, NonceCache, verifySignature } from '../auth/signatures.ts';
import type { T3Transport } from '../t3/client.ts';
import { executeCommand, isRelayableRead, parseCommand } from '../t3/commands.ts';
import { newPairingSecret, newTypedSecret, pairingLink, proofMatches, typedPairingCode, typedProofMatches, type ConnectorFrame, type ConnectorMachine, type RelayRequest, type ServerFrame } from './connector-protocol.ts';

/** What a connector keeps between runs: its machine token and the device keys it trusts from pairing. */
export type ConnectorState = { machineToken: string | null; trusted: { publicKey: string; name: string; pairedAt: string }[] };

export type ConnectorOptions = {
  /** The server's base URL, e.g. https://host.ts.net/borgdock. The socket is `<url>/api/connector`. */
  serverUrl: string;
  machine: ConnectorMachine;
  /** Null for the pairing-only CLI on the server's own machine. */
  t3: T3Transport | null;
  local?: boolean;
  /** Ask for a pairing code even when this machine is paired already (to pair another device). */
  pair?: boolean;
  /** Dial again after the socket drops. */
  reconnect?: boolean;
  load: () => ConnectorState;
  save: (state: ConnectorState) => void;
  /** `typedCode` is what to type when the camera can't read the QR: the server's code plus a secret only this machine knows. */
  onPairing?: (link: string, code: string, expiresAt: string, typedCode: string) => void;
  onPaired?: (deviceName: string) => void;
  onReady?: (label: string) => void;
  log?: (message: string) => void;
};

export function socketUrl(serverUrl: string): string {
  const url = new URL(serverUrl.replace(/\/+$/, '') + '/api/connector');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/**
 * The machine side of a connector: dials the server, shows pairing codes, checks the phone's pairing proof against
 * the secret only it holds, relays T3 reads, and runs a command only when a device it trusts signed it.
 */
export class ConnectorClient {
  private readonly options: ConnectorOptions;
  private socket: WebSocket | null = null;
  private secrets = new Map<string, { secret: string; typed: string }>();
  private readonly nonces = new NonceCache();
  private stopped = false;
  private backoffMs = 1000;
  private askPair: boolean;

  constructor(options: ConnectorOptions) {
    this.options = options;
    this.askPair = Boolean(options.pair);
  }

  private log(message: string) {
    this.options.log?.(message);
  }

  /** Resolves when the connector stops: after `stop()`, or when the socket closes and `reconnect` is off. */
  run(): Promise<void> {
    return new Promise((resolve) => {
      const dial = () => {
        if (this.stopped) return resolve();
        const socket = new WebSocket(socketUrl(this.options.serverUrl));
        this.socket = socket;
        socket.onopen = () => {
          this.backoffMs = 1000;
          const state = this.options.load();
          const hello = { type: 'hello' as const, token: state.machineToken ?? undefined, pair: this.askPair || !state.machineToken, local: this.options.local, machine: this.options.machine };
          if (this.options.local) delete hello.token;
          socket.send(JSON.stringify(hello));
        };
        socket.onmessage = ({ data }) => {
          this.receive(JSON.parse(String(data)) as ServerFrame).catch((error) => this.log(`Could not handle a server message: ${(error as Error).message}`));
        };
        socket.onerror = () => {};
        socket.onclose = ({ code, reason }) => {
          this.socket = null;
          if (!this.stopped) this.log(`Disconnected (${code}${reason ? `: ${reason}` : ''}).${this.options.reconnect ? ' Reconnecting…' : ''}`);
          if (this.stopped || !this.options.reconnect) return resolve();
          setTimeout(dial, this.backoffMs);
          this.backoffMs = Math.min(30_000, this.backoffMs * 2);
        };
      };
      dial();
    });
  }

  stop() {
    this.stopped = true;
    this.socket?.close(1000, 'Stopped');
  }

  private send(frame: ConnectorFrame) {
    this.socket?.send(JSON.stringify(frame));
  }

  private async receive(frame: ServerFrame) {
    switch (frame.type) {
      case 'welcome':
        this.options.onReady?.(frame.label);
        return;
      case 'pairing': {
        const secret = newPairingSecret();
        const typed = newTypedSecret();
        this.secrets.set(frame.code, { secret, typed });
        this.askPair = false;
        this.options.onPairing?.(pairingLink(frame.serverUrl, frame.code, secret), frame.code, frame.expiresAt, typedPairingCode(frame.code, typed));
        return;
      }
      case 'registered': {
        const state = this.options.load();
        this.options.save({ ...state, machineToken: frame.token });
        this.options.onReady?.(this.options.machine.label);
        return;
      }
      case 'paired':
        this.options.onPaired?.(frame.deviceName);
        return;
      case 'error':
        this.log(frame.message);
        if (frame.code === 'unpaired') {
          // Removed in the app: forget the token and the devices it trusted, so the next connection shows a new code.
          this.options.save({ machineToken: null, trusted: [] });
        }
        return;
      case 'request':
        try {
          this.send({ type: 'reply', id: frame.id, ok: true, value: await this.handle(frame.request) });
        } catch (error) {
          const status = (error as { status?: number }).status;
          this.send({ type: 'reply', id: frame.id, ok: false, error: (error as Error).message, status: typeof status === 'number' ? status : undefined });
        }
    }
  }

  private async handle(request: RelayRequest): Promise<unknown> {
    if (request.kind === 'verify') return this.verifyPairing(request.devicePublicKey, request.proof, request.deviceName);
    const t3 = this.options.t3;
    if (!t3) throw Object.assign(new Error('This connector only pairs.'), { status: 404 });
    if (request.kind === 'get') {
      if (!isRelayableRead(request)) throw Object.assign(new Error('Not a read this connector relays.'), { status: 403 });
      return t3.get(request.path);
    }
    if (request.kind === 'rpc') {
      if (!isRelayableRead(request)) throw Object.assign(new Error('Not a read this connector relays.'), { status: 403 });
      return t3.rpc(request.tag, request.payload ?? {});
    }
    return this.command(t3, request.envelope);
  }

  /** Trusts the key when the proof matches a code this connector is showing; the code is spent either way it matches. */
  private verifyPairing(devicePublicKey: string, proof: string, deviceName: string): boolean {
    for (const [code, { secret, typed }] of this.secrets) {
      if (!proofMatches(secret, devicePublicKey, proof) && !typedProofMatches(typed, devicePublicKey, proof)) continue;
      this.secrets.delete(code);
      const state = this.options.load();
      if (!state.trusted.some((t) => t.publicKey === devicePublicKey)) {
        state.trusted.push({ publicKey: devicePublicKey, name: String(deviceName ?? '').slice(0, 80) || 'Device', pairedAt: new Date().toISOString() });
        this.options.save(state);
      }
      return true;
    }
    return false;
  }

  private async command(t3: T3Transport, envelope: Parameters<typeof verifySignature>[1]) {
    const refuse = (message: string) => Object.assign(new Error(message), { status: 403 });
    const problem = envelopeProblem(envelope);
    if (problem) throw refuse(`Refused an unsigned or stale command (${problem}).`);
    const trusted = this.options.load().trusted.find((t) => verifySignature(t.publicKey, envelope));
    if (!trusted) throw refuse('No device this machine trusts signed that command. Pair the device with this machine first.');
    if (!this.nonces.use(envelope.nonce)) throw refuse('That command was already run.');
    const { id } = this.options.machine;
    const command = parseCommand(envelope.method, envelope.path, envelope.body, { id, prefix: `${id}:` });
    this.log(`${trusted.name}: ${command.kind}`);
    return executeCommand(t3, command);
  }
}
