import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Protocol notes: docs/t3-protocol.md. Auth is a bearer token minted with T3's own bundled CLI;
// commands go over the WebSocket (Effect RPC, one JSON message per frame, every stream chunk acked).

type T3Session = { sessionId: string; token: string; expiresAt: string };
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export type ModelSelection = { instanceId: string; model: string; options?: { id: string; value: unknown }[] };

export class T3Error extends Error {}

/** What reads and drives one T3 host: HTTP + WebSocket to it directly, or a connector relaying for it. */
export interface T3Transport {
  get<T>(path: string): Promise<T>;
  rpc<T>(tag: string, payload: Record<string, unknown>): Promise<T>;
  dispatch(command: Record<string, unknown>): Promise<{ sequence: number }>;
  close(): void;
}

/** A thread id in a T3 URL path; ids can hold ':' and '%'. */
export const threadPath = (threadId: string) => `/api/orchestration/threads/${encodeURIComponent(threadId)}`;

export class T3Client implements T3Transport {
  private readonly baseUrl: string;
  private readonly app: string;
  private readonly sessionFile: string;
  private session: T3Session | null = null;
  private readonly sessionCommand?: string[];
  private renewing: Promise<string> | null = null;
  private socket: Promise<WebSocket> | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;

  constructor(options: { baseUrl: string; app: string; dataDir: string; sessionFile?: string; sessionCommand?: string[] }) {
    this.baseUrl = options.baseUrl;
    this.app = options.app;
    this.sessionFile = options.sessionFile ?? join(options.dataDir, 't3-session.json');
    this.sessionCommand = options.sessionCommand;
  }

  private async cli(args: string[]): Promise<string> {
    const executable = basename(dirname(this.app), '.app');
    const { stdout } = await run(join(this.app, 'MacOS', executable), [`${this.app}/Resources/app.asar/apps/server/dist/bin.mjs`, ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 60_000,
    });
    return stdout;
  }

  // One long-lived session, stored owner-only, renewed a day before it expires or when T3 rejects it.
  private async token(forceNew = false): Promise<string> {
    if (!forceNew && !this.session && existsSync(this.sessionFile)) this.session = JSON.parse(readFileSync(this.sessionFile, 'utf8'));
    if (!forceNew && this.session && Date.parse(this.session.expiresAt) - Date.now() > 86_400_000) return this.session.token;
    this.renewing ??= this.renewToken().finally(() => { this.renewing = null; });
    return this.renewing;
  }

  private async renewToken(): Promise<string> {
    const output = this.sessionCommand
      ? (await run(this.sessionCommand[0], this.sessionCommand.slice(1), { timeout: 60_000, maxBuffer: 1024 * 1024 }).catch(() => { throw new T3Error('Could not renew this host’s T3 session'); })).stdout
      : await this.cli(['auth', 'session', 'issue', '--label', 'dispatch', '--ttl', '30d', '--json']);
    const fresh: T3Session = JSON.parse(output.slice(output.indexOf('{')));
    const previous = this.session;
    this.session = fresh;
    writeFileSync(this.sessionFile, JSON.stringify(fresh), { mode: 0o600 });
    if (previous && !this.sessionCommand) await this.cli(['auth', 'session', 'revoke', previous.sessionId]).catch(() => {});
    return fresh.token;
  }

  async get<T>(path: string): Promise<T> {
    for (const retry of [false, true]) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { authorization: `Bearer ${await this.token(retry)}`, 'x-t3-orchestration-protocol': '2' },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401 && !retry) continue;
      if (!response.ok) throw new T3Error(`T3 ${path} answered ${response.status}`);
      return response.json() as Promise<T>;
    }
    throw new T3Error('unreachable');
  }

  private connect(): Promise<WebSocket> {
    this.socket ??= (async () => {
      const ticketRequest = async () => fetch(`${this.baseUrl}/api/auth/websocket-ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await this.token()}` },
        signal: AbortSignal.timeout(10_000),
      });
      let response = await ticketRequest();
      if (response.status === 401) { await this.token(true); response = await ticketRequest(); }
      if (!response.ok) throw new T3Error(`T3 websocket ticket answered ${response.status}`);
      const { ticket } = (await response.json()) as { ticket: string };
      const ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws?orchestrationProtocol=2&wsTicket=${encodeURIComponent(ticket)}`);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new T3Error('T3 websocket timed out')); }, 10_000);
        ws.onopen = () => { clearTimeout(timeout); resolve(); };
        ws.onerror = () => { clearTimeout(timeout); reject(new T3Error('T3 websocket failed to open')); };
      });
      ws.onmessage = ({ data }) => this.receive(JSON.parse(String(data)));
      ws.onclose = () => {
        this.socket = null;
        for (const p of this.pending.values()) p.reject(new T3Error('T3 connection closed'));
        this.pending.clear();
      };
      return ws;
    })();
    this.socket.catch(() => { this.socket = null; });
    return this.socket;
  }

  private receive(message: any) {
    if (message._tag === 'Ping') return this.socket?.then((ws) => ws.send(JSON.stringify({ _tag: 'Pong' })));
    const pending = this.pending.get(message.requestId);
    if (!pending || message._tag !== 'Exit') return;
    this.pending.delete(message.requestId);
    if (message.exit._tag === 'Success') pending.resolve(message.exit.value);
    else pending.reject(new T3Error(describeFailure(message.exit.cause)));
  }

  async dispatch(command: Record<string, unknown>): Promise<{ sequence: number }> {
    const rpc = commandRpc(command);
    return this.rpc(rpc.tag, rpc.payload);
  }

  async rpc<T>(tag: string, payload: Record<string, unknown>): Promise<T> {
    const ws = await this.connect();
    const id = String(this.nextId++);
    let timeout: NodeJS.Timeout;
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      timeout = setTimeout(() => {
        if (this.pending.delete(id)) reject(new T3Error('T3 did not answer within 30 seconds'));
      }, 30_000);
    });
    ws.send(JSON.stringify({ _tag: 'Request', id, tag, payload: { commandId: randomUUID(), ...payload }, headers: [] }));
    return result.finally(() => clearTimeout(timeout));
  }

  close() {
    this.socket?.then((ws) => ws.close()).catch(() => {});
  }
}

export function commandRpc(command: Record<string, any>): { tag: string; payload: Record<string, unknown> } {
  if (command.type === 'thread.turn.start') {
    const thread = command.bootstrap.createThread;
    return {
      tag: 'orchestration.launchThread',
      payload: {
        threadId: command.threadId,
        projectId: thread.projectId,
        title: thread.title,
        modelSelection: command.modelSelection,
        runtimeMode: command.runtimeMode,
        interactionMode: command.interactionMode,
        workspaceStrategy: { type: 'root' },
        initialMessage: { messageId: command.message.messageId, text: command.message.text, attachments: command.message.attachments },
      },
    };
  }
  if (command.type === 'thread.user-input.respond') {
    const { createdAt: _at, ...payload } = command;
    return { tag: 'orchestration.dispatchCommand', payload: { ...payload, type: 'runtime-request.respond' } };
  }
  return { tag: 'orchestration.dispatchCommand', payload: command };
}

function describeFailure(cause: any): string {
  const failure = Array.isArray(cause) ? cause.find((c) => c.error) : null;
  return failure?.error?.message ?? 'T3 rejected the command';
}
