import { randomInt, randomUUID } from 'node:crypto';
import type { Machine } from '../../../shared/src/api.ts';
import { RateLimiter } from '../auth/request.ts';
import { randomToken, sha256 } from '../auth/sessions.ts';
import { signedRequest } from '../auth/signatures.ts';
import type { Config } from '../config.ts';
import { now, type Db, type Via } from '../db.ts';
import { T3Error, type T3Transport } from '../t3/client.ts';
import type { T3Fleet, T3Host } from '../t3/fleet.ts';
import type { ConnectorFrame, ConnectorMachine, Hello, RelayRequest, ServerFrame } from './connector-protocol.ts';
import { migratePlatform } from './schema.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAIRING_MINUTES = 10;
const MAX_PROOF_FAILURES = 5;
const MAX_PENDING = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const normalizeCode = (code: string) => String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

export class PairingError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** One open connector socket. */
export type LinkSocket = { send(text: string): void; close(code?: number, reason?: string): void };

type Link = {
  socket: LinkSocket;
  machine: ConnectorMachine;
  /** The CLI on the server's own machine, connected over loopback: the only place a claim code comes from. */
  local: boolean;
  /** Set once the machine is paired and has its token. */
  machineId: string | null;
  pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
};

type Pairing = { link: Link; expiresAt: number; failures: number };

type MachineRow = { id: string; label: string; token_hash: string; version: string | null; created_at: string; last_seen_at: string | null };

/**
 * Machines and their connectors: pairing codes, the dial-out sockets, relaying T3 reads and signed commands,
 * and which devices each machine trusts. The secret in a pairing QR stays with the connector; the server only
 * passes the phone's proof on and learns the answer.
 */
export class MachineHub {
  private readonly config: Config;
  private readonly db: Db;
  private readonly fleet: () => T3Fleet | null;
  private links = new Map<string, Link>();
  private pairings = new Map<string, Pairing>();
  private readonly helloLimiter = new RateLimiter(10, 10 * 60_000);

  constructor(config: Config, db: Db, fleet: () => T3Fleet | null) {
    this.config = config;
    this.db = db;
    this.fleet = fleet;
    migratePlatform(db);
  }

  /** Known connector machines join the fleet at startup, offline until they dial in. */
  attachKnown() {
    for (const row of this.rows()) this.attach(row.id, row.label);
  }

  private rows(): MachineRow[] {
    return this.db.prepare('SELECT * FROM bd_machines WHERE revoked_at IS NULL ORDER BY created_at').all() as MachineRow[];
  }

  private attach(machineId: string, label: string): T3Host | null {
    const fleet = this.fleet();
    if (!fleet) return null;
    return fleet.attach(
      { label, baseUrl: 'connector', environmentId: machineId, webBase: '', app: '', stateDb: '', pollSeconds: 4 },
      new ConnectorTransport(this, machineId, label),
    );
  }

  get localMachineId(): string {
    return this.config.t3.environmentId;
  }

  /* ---------- sockets ---------- */

  open(socket: LinkSocket, client: { via: Via; ip: string | null }) {
    let link: Link | null = null;
    const send = (frame: ServerFrame) => socket.send(JSON.stringify(frame));
    const fail = (message: string, code?: 'unpaired') => {
      send({ type: 'error', message, ...(code ? { code } : {}) });
      socket.close(1008, message.slice(0, 120));
    };
    return {
      message: (text: string) => {
        let frame: ConnectorFrame;
        try {
          frame = JSON.parse(text);
        } catch {
          return fail('Send JSON frames.');
        }
        if (!link) {
          if (frame.type !== 'hello') return fail('Say hello first.');
          try {
            link = this.hello(socket, frame, client);
          } catch (error) {
            return fail((error as Error).message, (error as { code?: 'unpaired' }).code);
          }
          return;
        }
        if (frame.type === 'reply') {
          const waiting = link.pending.get(frame.id);
          if (!waiting) return;
          link.pending.delete(frame.id);
          clearTimeout(waiting.timer);
          if (frame.ok) waiting.resolve(frame.value);
          else waiting.reject(Object.assign(new T3Error(frame.error), { status: frame.status }));
        }
      },
      closed: () => {
        if (!link) return;
        for (const [code, pairing] of this.pairings) if (pairing.link === link) this.pairings.delete(code);
        for (const waiting of link.pending.values()) {
          clearTimeout(waiting.timer);
          waiting.reject(new T3Error(`${link.machine.label} disconnected`));
        }
        if (link.machineId && this.links.get(link.machineId) === link) this.links.delete(link.machineId);
      },
    };
  }

  private hello(socket: LinkSocket, hello: Hello, client: { via: Via; ip: string | null }): Link {
    const machine: ConnectorMachine = {
      id: String(hello.machine?.id ?? '').slice(0, 200),
      label: String(hello.machine?.label ?? '').trim().slice(0, 60) || 'Machine',
      version: hello.machine?.version ? String(hello.machine.version).slice(0, 40) : null,
    };
    if (!machine.id) throw new Error('Tell the server which T3 environment this is.');
    const link: Link = { socket, machine, local: false, machineId: null, pending: new Map() };
    const send = (frame: ServerFrame) => socket.send(JSON.stringify(frame));

    if (hello.local) {
      if (client.via !== 'local') throw new Error('Pairing this machine only works on the machine itself.');
      if (machine.id !== this.localMachineId) throw new Error("That isn't this server's T3 environment.");
      link.local = true;
      link.machineId = machine.id;
      send(this.newPairing(link));
      return link;
    }

    if (hello.token) {
      const row = this.db.prepare('SELECT * FROM bd_machines WHERE token_hash = ? AND revoked_at IS NULL').get(sha256(hello.token)) as MachineRow | undefined;
      if (!row || row.id !== machine.id) throw Object.assign(new Error('This machine is no longer paired. Pair it again.'), { code: 'unpaired' as const });
      this.db.prepare('UPDATE bd_machines SET label = ?, version = ?, last_seen_at = ? WHERE id = ?').run(machine.label, machine.version, now(), row.id);
      link.machineId = row.id;
      this.links.get(row.id)?.socket.close(1000, 'Replaced by a new connection');
      this.links.set(row.id, link);
      send({ type: 'welcome', machineId: row.id, label: machine.label });
      this.attach(row.id, machine.label);
      if (hello.pair) send(this.newPairing(link));
      return link;
    }

    if (!this.helloLimiter.allow(client.ip ?? client.via)) throw new Error('Too many pairing attempts. Wait ten minutes.');
    // A removed machine (revoked row, its connector host still in the fleet) may pair again; a configured host or an
    // active pairing may not.
    const host = this.fleet()?.byEnvironment(machine.id);
    const active = this.db.prepare('SELECT 1 FROM bd_machines WHERE id = ? AND revoked_at IS NULL').get(machine.id);
    if (machine.id === this.localMachineId || (host && host.kind !== 'connector') || active) {
      throw new Error('A machine with this T3 environment is already paired. Remove it in the app first.');
    }
    send(this.newPairing(link));
    return link;
  }

  private newPairing(link: Link): ServerFrame {
    const nowMs = Date.now();
    for (const [code, p] of this.pairings) if (p.expiresAt < nowMs) this.pairings.delete(code);
    if (this.pairings.size >= MAX_PENDING) throw new Error('Too many pairings are waiting. Try again in a few minutes.');
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = nowMs + PAIRING_MINUTES * 60_000;
    this.pairings.set(code, { link, expiresAt, failures: 0 });
    return { type: 'pairing', code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: new Date(expiresAt).toISOString(), serverUrl: this.config.publicOrigin };
  }

  private request(link: Link, request: RelayRequest, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        link.pending.delete(id);
        reject(new T3Error(`${link.machine.label} did not answer within ${Math.round(timeoutMs / 1000)} seconds`));
      }, timeoutMs);
      link.pending.set(id, { resolve, reject, timer });
      link.socket.send(JSON.stringify({ type: 'request', id, request } satisfies ServerFrame));
    });
  }

  /** Relays to a connected machine; rejects when it is offline. */
  relay(machineId: string, request: RelayRequest): Promise<unknown> {
    const link = this.links.get(machineId);
    if (!link) return Promise.reject(new T3Error(`${this.labelOf(machineId)} is offline`));
    return this.request(link, request);
  }

  online(machineId: string): boolean {
    return this.links.has(machineId);
  }

  private labelOf(machineId: string): string {
    return this.fleet()?.byEnvironment(machineId)?.config.label ?? 'That machine';
  }

  /* ---------- pairing ---------- */

  /**
   * Passes the phone's proof to the connector that showed `code`; the connector checks it against its secret and
   * starts trusting the key. 409 when the code expired or was used; 403 when the proof is wrong.
   */
  async verifyPairing(input: { code: string; proof: string; devicePublicKey: string; deviceName: string }, options: { requireLocal: boolean }): Promise<{ machineId: string; label: string; local: boolean }> {
    const code = normalizeCode(input.code);
    const pairing = this.pairings.get(code);
    if (!pairing || pairing.expiresAt < Date.now()) {
      this.pairings.delete(code);
      throw new PairingError('That pairing code expired or was used. Show a new one on the machine.', 409);
    }
    if (options.requireLocal && !pairing.link.local) throw new PairingError("Claim this server with the code `npm run cli -- pair` shows on the server's own machine.", 403);
    const verdict = await this.request(pairing.link, { kind: 'verify', devicePublicKey: input.devicePublicKey, proof: String(input.proof ?? ''), deviceName: input.deviceName }, 15_000)
      .catch(() => false);
    if (verdict !== true) {
      pairing.failures += 1;
      if (pairing.failures >= MAX_PROOF_FAILURES) this.pairings.delete(code);
      throw new PairingError("That pairing proof doesn't match the code. Scan the QR code again.", 403);
    }
    this.pairings.delete(code);
    const { link } = pairing;
    if (!link.machineId) {
      const token = randomToken();
      this.db.prepare('DELETE FROM bd_machines WHERE id = ? AND revoked_at IS NOT NULL').run(link.machine.id);
      this.db.prepare('INSERT INTO bd_machines (id, label, token_hash, version, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(link.machine.id, link.machine.label, sha256(token), link.machine.version, now(), now());
      link.machineId = link.machine.id;
      this.links.set(link.machine.id, link);
      link.socket.send(JSON.stringify({ type: 'registered', machineId: link.machine.id, token } satisfies ServerFrame));
      this.attach(link.machine.id, link.machine.label);
    }
    link.socket.send(JSON.stringify({ type: 'paired', deviceName: input.deviceName } satisfies ServerFrame));
    return { machineId: link.machineId!, label: link.machine.label, local: link.local };
  }

  /* ---------- trust ---------- */

  trust(machineId: string, sessionId: string) {
    this.db.prepare('INSERT OR IGNORE INTO bd_machine_trust (machine_id, session_id, at) VALUES (?, ?, ?)').run(machineId, sessionId, now());
  }

  /** The server's own machine trusts every device of the owner; a connector only the devices that paired it. */
  trustedBy(sessionId: string): string[] {
    const paired = (this.db.prepare('SELECT machine_id FROM bd_machine_trust WHERE session_id = ?').all(sessionId) as { machine_id: string }[]).map((r) => r.machine_id);
    return [...new Set([this.localMachineId, ...paired])];
  }

  trusts(machineId: string, sessionId: string): boolean {
    return this.trustedBy(sessionId).includes(machineId);
  }

  /* ---------- listing ---------- */

  machines(): Machine[] {
    const fleet = this.fleet();
    if (!fleet) return [];
    const versions = new Map(this.rows().map((r) => [r.id, r.version]));
    const threads = [...fleet.threads.values()];
    // A removed connector's host stays in the fleet (it may pair again) but isn't one of your machines any more.
    return fleet.hosts.filter((host) => host.kind !== 'connector' || versions.has(host.config.environmentId)).map((host) => ({
      id: host.config.environmentId,
      label: host.config.label,
      kind: host.kind,
      online: host.kind === 'connector' ? this.online(host.config.environmentId) && host.source.status.ok : host.source.status.ok,
      lastSeenAt: host.source.status.at,
      threads: threads.filter((t) => t.environmentId === host.config.environmentId && t.open).length,
      version: versions.get(host.config.environmentId) ?? null,
    }));
  }

  /** Removing a machine forgets its token and trust; its connector has to pair again. */
  remove(machineId: string): boolean {
    this.links.get(machineId)?.socket.close(1000, 'Removed');
    this.db.prepare('DELETE FROM bd_machine_trust WHERE machine_id = ?').run(machineId);
    return this.db.prepare('UPDATE bd_machines SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now(), machineId).changes > 0;
  }
}

/**
 * T3 for a machine behind a connector. Reads are relayed; a command is relayed only as the signed request it came
 * in, so the connector checks the device's signature itself and reads the command out of it.
 */
export class ConnectorTransport implements T3Transport {
  private readonly hub: MachineHub;
  private readonly machineId: string;
  private readonly label: string;

  constructor(hub: MachineHub, machineId: string, label: string) {
    this.hub = hub;
    this.machineId = machineId;
    this.label = label;
  }

  get<T>(path: string): Promise<T> {
    return this.hub.relay(this.machineId, { kind: 'get', path }) as Promise<T>;
  }

  rpc<T>(tag: string, payload: Record<string, unknown>): Promise<T> {
    return this.hub.relay(this.machineId, { kind: 'rpc', tag, payload }) as Promise<T>;
  }

  /** Whatever the server built is dropped: the connector runs what the signed request says. */
  async dispatch(): Promise<{ sequence: number }> {
    await this.command();
    return { sequence: 0 };
  }

  async command(): Promise<{ threadId: string }> {
    const envelope = signedRequest.getStore();
    if (!envelope) throw new T3Error(`Commands for ${this.label} need a signature from your device.`);
    return this.hub.relay(this.machineId, { kind: 'command', envelope }) as Promise<{ threadId: string }>;
  }

  close() {}
}
