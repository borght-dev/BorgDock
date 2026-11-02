import type { Branches, LaunchRequest, LaunchTargets, StartThreadResponse, ThreadDetail, ThreadMessage } from '../../../shared/src/api.ts';
import type { SignedEnvelope } from '../auth/signatures.ts';
import { now } from '../db.ts';
import { threadSummary } from '../engine/overview.ts';
import { UserError } from '../service.ts';
import { threadPath } from '../t3/client.ts';
import { CommandError, executeCommand, listBranches, parseCommand } from '../t3/commands.ts';
import type { T3Host } from '../t3/fleet.ts';
import { ConnectorTransport } from './machines.ts';
import type { Platform } from './platform.ts';

const MESSAGES_KEPT = 120;
const READ_ITEMS = /read|search|list|grep|glob|web|fetch/i;

function fleetOf(platform: Platform) {
  const fleet = platform.deps.service.fleet;
  if (!fleet) throw new UserError('T3 is not set up on this server.', 503);
  return fleet;
}

function machine(platform: Platform, machineId: string): T3Host {
  const host = fleetOf(platform).byEnvironment(String(machineId ?? ''));
  if (!host) throw new UserError('Unknown machine', 404);
  return host;
}

function requireOnline(platform: Platform, host: T3Host) {
  const online = host.kind === 'connector' ? platform.hub.online(host.config.environmentId) && host.source.status.ok : host.source.status.ok;
  if (!online) throw new UserError(`${host.config.label} is offline. Try again when it's back.`, 503);
}

/** Connectors only take commands from the devices that paired them; the server's own T3 from every owner device. */
function requireTrust(platform: Platform, host: T3Host, sessionId: string) {
  if (!platform.hub.trusts(host.config.environmentId, sessionId)) {
    throw new UserError(`Pair this device with ${host.config.label} first: scan its QR code in Settings → Machines.`, 403);
  }
}

/** Errors from T3, a connector or the command parser, as the HTTP status they mean. */
export function asUserError(error: unknown): never {
  if (error instanceof UserError) throw error;
  const status = (error as { status?: number }).status;
  if (error instanceof CommandError || (typeof status === 'number' && status >= 400 && status < 500)) throw new UserError((error as Error).message, status ?? 400);
  throw error;
}

async function run(platform: Platform, host: T3Host, envelope: SignedEnvelope, sessionId: string): Promise<{ threadId: string }> {
  requireOnline(platform, host);
  requireTrust(platform, host, sessionId);
  try {
    if (host.client instanceof ConnectorTransport) return await host.client.command();
    const command = parseCommand(envelope.method, envelope.path, envelope.body, { id: host.config.environmentId, prefix: host.prefix });
    return await executeCommand(host.client, command);
  } catch (error) {
    asUserError(error);
  }
}

export function targets(platform: Platform): LaunchTargets {
  const fleet = fleetOf(platform);
  const { service } = platform.deps;
  const projects: LaunchTargets['projects'] = [];
  for (const host of fleet.hosts) {
    const byRepository = new Map<string, { id: string; title: string; root: string; repository: string }>();
    for (const project of host.source.projects.values()) {
      if (!project.repository) continue;
      const root = project.workspaceRoot ?? '';
      const known = byRepository.get(project.repository.key);
      if (!known || root.length < known.root.length) byRepository.set(project.repository.key, { id: project.id, title: project.title, root, repository: project.repository.displayName });
    }
    for (const p of [...byRepository.values()].sort((a, b) => a.repository.localeCompare(b.repository))) {
      projects.push({ id: fleet.scopedId(host, p.id), machineId: host.config.environmentId, title: p.title, repository: p.repository, defaultBranch: null });
    }
  }
  const threads = [...fleet.threads.values()]
    .filter((t) => t.open && t.available !== false)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .map((t) => ({ id: t.id, machineId: t.environmentId ?? fleet.hosts[0].config.environmentId, projectId: t.projectId, title: t.title, place: service.placeOf(t), status: t.status }));
  const { models, defaultModel } = service.launchChoices(fleet.hosts[0]);
  return { machines: platform.hub.machines(), projects, threads, models, defaultModel };
}

export async function branches(platform: Platform, machineId: string, projectId: string): Promise<Branches> {
  const host = machine(platform, machineId);
  const project = fleetOf(platform).projects.get(String(projectId ?? ''));
  if (!project || project.environmentId !== host.config.environmentId) throw new UserError('Unknown project', 404);
  if (!project.workspaceRoot) throw new UserError(`${project.title} has no checkout to branch from.`);
  requireOnline(platform, host);
  try {
    return await listBranches(host.client, project.workspaceRoot);
  } catch (error) {
    asUserError(error);
  }
}

export async function launch(platform: Platform, request: LaunchRequest, envelope: SignedEnvelope, sessionId: string): Promise<StartThreadResponse> {
  const { service, db } = platform.deps;
  if (!request || typeof request !== 'object') throw new UserError('Send a launch request.');
  if (request.itemId !== null && request.itemId !== undefined && !Number.isInteger(request.itemId)) throw new UserError('itemId must be a work item number');
  const host = machine(platform, request.machineId);
  const fleet = fleetOf(platform);
  const result = await run(platform, host, envelope, sessionId);
  const threadId = fleet.scopedId(host, result.threadId);
  const continued = request.workspace?.kind === 'thread' && request.workspace.mode === 'continue';
  // A continued thread keeps the item it belongs to; a new one belongs to the item asked for, or to none.
  if (!continued) db.prepare('INSERT OR REPLACE INTO thread_links (thread_id, item_id, linked_at) VALUES (?, ?, ?)').run(threadId, request.itemId ?? null, now());
  platform.live.launched(threadId, sessionId);

  // The thread runs at this point; an ADO step that fails is reported, not rolled back.
  let adoState: string | null = null;
  let warning: string | null = null;
  if (request.moveAdoTo && request.itemId) {
    adoState = await service.ado.moveState(request.itemId, request.moveAdoTo).catch((e: Error) => { warning = `ADO state not changed: ${e.message}`; return null; });
  }
  service.refreshSoon();
  return { threadId, ...service.threadLink(threadId), adoState, warning };
}

/** POST /threads/:id/messages and /approve-plan: the command is read from the signed request. */
export async function threadCommand(platform: Platform, threadId: string, envelope: SignedEnvelope, sessionId: string): Promise<void> {
  const fleet = fleetOf(platform);
  if (!fleet.threads.has(threadId)) throw new UserError('Unknown thread', 404);
  await run(platform, fleet.hostFor(threadId), envelope, sessionId);
  platform.deps.service.refreshSoon();
}

type Projection = {
  messages?: { id?: string; role: string; text?: string; createdAt: string }[];
  turnItems?: { type: string; startedAt?: string | null; completedAt?: string | null; updatedAt?: string | null }[];
};

export async function threadDetail(platform: Platform, threadId: string): Promise<ThreadDetail> {
  const fleet = fleetOf(platform);
  const { service, db } = platform.deps;
  const thread = fleet.threads.get(threadId);
  if (!thread) throw new UserError('Unknown thread', 404);
  const host = fleet.hostFor(threadId);
  let projection: Projection = {};
  try {
    projection = (await host.client.get<{ projection?: Projection }>(`${threadPath(fleet.rawId(threadId))}/bounded`)).projection ?? {};
  } catch (error) {
    if (host.source.status.ok) asUserError(error);
  }
  const messages: ThreadMessage[] = (projection.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text?.trim())
    .slice(-MESSAGES_KEPT)
    .map((m, index) => ({ id: m.id ?? `${threadId}:${index}`, role: m.role as 'user' | 'assistant', text: m.text!, at: m.createdAt }));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.at ?? '';
  const work = (projection.turnItems ?? []).filter((i) => i.type !== 'assistant_message' && i.type !== 'reasoning' && (i.startedAt ?? i.updatedAt ?? '') >= lastUser);
  const times = work.flatMap((i) => [i.startedAt, i.completedAt ?? i.updatedAt]).filter((t): t is string => Boolean(t)).sort();
  const activity = work.length
    ? { reads: work.filter((i) => READ_ITEMS.test(i.type)).length, commands: work.filter((i) => i.type === 'command_execution').length, minutes: times.length ? Math.max(0, Math.round((Date.parse(times.at(-1)!) - Date.parse(times[0])) / 60_000)) : 0 }
    : null;
  const linked = db.prepare('SELECT item_id FROM thread_links WHERE thread_id = ?').get(threadId) as { item_id: number | null } | undefined;
  const itemId = service.overview?.items.find((o) => o.threads.some((t) => t.id === threadId))?.item.id ?? linked?.item_id ?? null;
  const summary = threadSummary(thread, (id) => service.threadLink(id));
  return { thread: summary, itemId, place: service.placeOf(summary), machine: host.config.label, messages, activity, planReady: thread.status === 'plan' };
}
