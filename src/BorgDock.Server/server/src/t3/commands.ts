import { randomUUID } from 'node:crypto';
import type { LaunchRequest } from '../../../shared/src/api.ts';
import { threadPath, type T3Transport } from './client.ts';
import { liveModelCatalogue, type LiveProvider } from './models.ts';
import { statusOf, type Shell, type ShellThread } from './source.ts';

// The agent commands a signed request can carry, read from the request itself. The server runs them on its own
// T3; a connector runs the same code on the envelope it was relayed, so it never takes the server's word for what
// the phone asked. Payloads follow the desktop's src-tauri/src/t3/commands.rs (T3 protocol 2).

// T3's plan mode sticks to the thread and keeps the agent read-only after approval, so "plan first" is an
// instruction and the thread runs in default mode.
export const PLAN_FIRST = 'Before changing anything, propose a plan and wait for my go-ahead.';
/** What "Approve plan" tells the agent. */
export const GO_AHEAD_MESSAGE = 'Go ahead with the plan.';
const DEFAULT_RUNTIME_MODE = 'full-access';
const TITLE_LIMIT = 120;
const MESSAGE_LIMIT = 20_000;

export class CommandError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type AgentCommand =
  | { kind: 'launch'; request: LaunchRequest }
  | { kind: 'message'; threadId: string; text: string }
  | { kind: 'approve-plan'; threadId: string }
  | { kind: 'answer'; threadId: string; requestId: string; answers: Record<string, string | string[]> }
  | { kind: 'settle'; threadId: string };

export type CommandResult = { threadId: string };

/**
 * Reads the command out of a signed request for the machine `machineId`, whose ids carry `prefix` on the server
 * (empty for the server's own T3). Ids for another machine are refused, so a relay can't redirect a command.
 */
export function parseCommand(method: string, path: string, body: string, machine: { id: string; prefix: string }): AgentCommand {
  if (method !== 'POST') throw new CommandError('Not an agent command', 404);
  const input = parseBody(body);
  const raw = (id: unknown): string => {
    const text = String(id ?? '');
    if (!text) throw new CommandError('A thread or project id is missing');
    if (machine.prefix) {
      if (!text.startsWith(machine.prefix)) throw new CommandError('That command is for another machine', 403);
      return text.slice(machine.prefix.length);
    }
    return text;
  };
  if (path === '/api/agents/launch') {
    const request = input as LaunchRequest;
    if (request.machineId !== machine.id) throw new CommandError('That command is for another machine', 403);
    const workspace = request.workspace?.kind === 'thread'
      ? { kind: 'thread' as const, threadId: raw(request.workspace.threadId), mode: request.workspace.mode }
      : { kind: 'worktree' as const, baseBranch: request.workspace?.baseBranch ?? null };
    return { kind: 'launch', request: { ...request, projectId: raw(request.projectId), workspace } };
  }
  const match = /^\/api\/threads\/([^/]+)\/(messages|approve-plan|answers|settle)$/.exec(path);
  if (!match) throw new CommandError('Not an agent command', 404);
  const threadId = raw(decodeURIComponent(match[1]));
  switch (match[2]) {
    case 'messages': return { kind: 'message', threadId, text: String((input as { text?: unknown }).text ?? '') };
    case 'approve-plan': return { kind: 'approve-plan', threadId };
    case 'answers': {
      const { requestId, answers } = input as { requestId?: unknown; answers?: unknown };
      return { kind: 'answer', threadId, requestId: String(requestId ?? ''), answers: (answers ?? {}) as Record<string, string | string[]> };
    }
    default: return { kind: 'settle', threadId };
  }
}

function parseBody(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new CommandError('Send a JSON body.');
  }
}

function checkedMessage(text: string): string {
  const written = String(text ?? '').trim();
  if (!written) throw new CommandError('The message is empty');
  if (written.length > MESSAGE_LIMIT) throw new CommandError('The message is longer than 20,000 characters');
  return written;
}

export function withPlanFirst(text: string): string {
  return text.includes(PLAN_FIRST) ? text : `${text.trimEnd()}\n\n${PLAN_FIRST}`;
}

/* ---------- payloads ---------- */

export type WorkspaceStrategy =
  | { type: 'root' }
  | { type: 'worktree'; baseRef: string; startFromOrigin: true }
  | { type: 'existing_worktree'; worktreePath: string; branch: string | null };

export function messageCommand(threadId: string, text: string) {
  return {
    type: 'message.dispatch',
    threadId,
    messageId: randomUUID(),
    text,
    attachments: [],
    createdBy: 'user',
    creationSource: 'web',
    dispatchMode: { type: 'start_immediately' },
    deliveryIntent: 'auto',
  };
}

export function launchPayload(input: {
  threadId: string; projectId: string; title: string; modelSelection: unknown; runtimeMode: string; workspace: WorkspaceStrategy; text: string;
}) {
  return {
    threadId: input.threadId,
    projectId: input.projectId,
    title: input.title.slice(0, TITLE_LIMIT),
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: 'default',
    workspaceStrategy: input.workspace,
    initialMessage: { messageId: randomUUID(), text: input.text, attachments: [] },
  };
}

type Ref = { name?: string; isDefault?: boolean; isRemote?: boolean };

/** The branches a new worktree of `checkout` can start from, and the default by its local name when it has one. */
export async function listBranches(t3: Pick<T3Transport, 'rpc'>, checkout: string): Promise<{ branches: string[]; defaultBranch: string | null }> {
  const result = await t3.rpc<{ refs?: Ref[] }>('vcs.listRefs', { cwd: checkout, refKind: 'all', limit: 100 });
  const refs = (result?.refs ?? []).filter((r): r is Ref & { name: string } => typeof r.name === 'string');
  const defaults = refs.filter((r) => r.isDefault).sort((a, b) => Number(Boolean(a.isRemote)) - Number(Boolean(b.isRemote)));
  const local = refs.filter((r) => !r.isRemote).map((r) => r.name);
  const remote = refs.filter((r) => r.isRemote).map((r) => r.name).filter((name) => !local.includes(name.replace(/^[^/]+\//, '')));
  return { branches: [...local, ...remote], defaultBranch: defaults[0]?.name ?? null };
}

/* ---------- running a command ---------- */

const dispatch = (t3: T3Transport, command: Record<string, unknown>) => t3.rpc('orchestration.dispatchCommand', command);

function findThread(shell: Shell, threadId: string): ShellThread {
  const thread = shell.threads.find((t) => t.id === threadId);
  if (!thread) throw new CommandError('T3 no longer has that thread', 404);
  return thread;
}

/** The runtime mode of the thread touched last, as a new thread in T3 itself would get. */
function runtimeModeOf(shell: Shell): string {
  const latest = [...shell.threads].filter((t) => !(t as { deletedAt?: string | null }).deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
}

/** Runs `command` against one machine's T3 and answers with the thread it worked on (raw id, as T3 knows it). */
export async function executeCommand(t3: T3Transport, command: AgentCommand): Promise<CommandResult> {
  switch (command.kind) {
    case 'message': {
      const text = checkedMessage(command.text);
      await dispatch(t3, messageCommand(command.threadId, text));
      return { threadId: command.threadId };
    }
    case 'approve-plan': {
      const shell = await t3.get<Shell>('/api/orchestration/shell');
      const thread = findThread(shell, command.threadId);
      if (thread.interactionMode === 'plan') {
        await dispatch(t3, { type: 'thread.interaction-mode.set', threadId: thread.id, interactionMode: 'default' });
      }
      await dispatch(t3, messageCommand(thread.id, GO_AHEAD_MESSAGE));
      return { threadId: thread.id };
    }
    case 'answer': {
      if (!command.requestId) throw new CommandError('requestId is missing');
      await dispatch(t3, { type: 'runtime-request.respond', threadId: command.threadId, requestId: command.requestId, answers: command.answers });
      return { threadId: command.threadId };
    }
    case 'settle':
      await dispatch(t3, { type: 'thread.settle', threadId: command.threadId });
      return { threadId: command.threadId };
    case 'launch':
      return launch(t3, command.request);
  }
}

async function launch(t3: T3Transport, request: LaunchRequest): Promise<CommandResult> {
  const written = checkedMessage(request.message);
  const text = request.planFirst ? withPlanFirst(written) : written;
  const shell = await t3.get<Shell>('/api/orchestration/shell');
  const workspace = request.workspace;

  if (workspace.kind === 'thread' && workspace.mode === 'continue') {
    const thread = findThread(shell, workspace.threadId);
    if (statusOf(thread) === 'running') throw new CommandError(`${thread.title} is still at work. Start a new thread beside it instead.`, 409);
    await dispatch(t3, messageCommand(thread.id, text));
    return { threadId: thread.id };
  }

  let projectId = request.projectId;
  let strategy: WorkspaceStrategy;
  if (workspace.kind === 'thread') {
    const thread = findThread(shell, workspace.threadId);
    projectId = thread.projectId;
    strategy = thread.worktreePath ? { type: 'existing_worktree', worktreePath: thread.worktreePath, branch: thread.branch } : { type: 'root' };
  } else {
    const project = shell.projects.find((p) => p.id === projectId);
    if (!project) throw new CommandError('T3 no longer lists that project', 404);
    let base = workspace.baseBranch?.trim() || null;
    if (!base) {
      if (!project.workspaceRoot) throw new CommandError(`${project.title} has no checkout to branch from.`);
      base = (await listBranches(t3, project.workspaceRoot)).defaultBranch;
      if (!base) throw new CommandError(`T3 names no default branch for ${project.title}. Pick the branch to start from.`);
    }
    strategy = { type: 'worktree', baseRef: base, startFromOrigin: true };
  }

  const config = await t3.rpc<{ providers?: LiveProvider[] }>('server.getConfig', {});
  const catalogue = liveModelCatalogue(config.providers ?? [], []);
  const modelId = request.model ?? catalogue.fallbackModel;
  if (!modelId || !catalogue.models.some((m) => m.id === modelId)) throw new CommandError(`This machine can't start ${request.model ?? 'a model'}. Pick another model.`);
  let modelSelection: unknown;
  try {
    modelSelection = catalogue.selection(modelId, request.effort ?? null);
  } catch (error) {
    throw new CommandError((error as Error).message);
  }

  const threadId = randomUUID();
  await t3.rpc('orchestration.launchThread', launchPayload({
    threadId,
    projectId,
    title: String(request.title ?? '').trim() || written.split('\n')[0].slice(0, 80),
    modelSelection,
    runtimeMode: runtimeModeOf(shell),
    workspace: strategy,
    text,
  }));
  return { threadId };
}

/* ---------- reads ---------- */

/** What a connector relays without a signature: the shell, a thread's projection, the provider list, branches. */
export function isRelayableRead(request: { kind: 'get'; path: string } | { kind: 'rpc'; tag: string }): boolean {
  if (request.kind === 'get') return request.path === '/api/orchestration/shell' || /^\/api\/orchestration\/threads\/[^/?#]+(\/bounded)?$/.test(request.path);
  return request.tag === 'server.getConfig' || request.tag === 'vcs.listRefs';
}

export { threadPath };
