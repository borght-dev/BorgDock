import { toggleTrackedWorkItem } from '@/components/work-items/work-item-toggles';
import { AdoClient } from '@/services/ado/client';
import {
  LOCAL_T3_HOST_ID,
  type T3HostRef,
  type T3Thread,
  t3FirstUserMessages,
  t3Snapshot,
  t3ThreadDetail,
} from '@/services/t3/api';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AppSettings, PullRequestWithChecks } from '@/types';
import { buildOverview } from './engine';
import { loadDispatchItems } from './items';
import { notifyNew } from './notifier';
import {
  type AgentProject,
  type AgentThread,
  type KnownPullRequest,
  NEEDS_YOU,
  type Overview,
} from './types';

/** A T3 server Dispatch follows. */
export interface DispatchHost {
  id: string;
  label: string;
  /** Absent for the T3 on this machine. */
  baseUrl?: string;
}

export const LOCAL_HOST: DispatchHost = { id: LOCAL_T3_HOST_ID, label: 'This machine' };

/** The hosts to follow. */
export function configuredHosts(_settings: AppSettings): DispatchHost[] {
  return [LOCAL_HOST];
}

function hostRef(host: DispatchHost): T3HostRef {
  return { id: host.id, baseUrl: host.baseUrl };
}

/** Ids from a remote host carry the host id, so two hosts never collide. */
export function scopedId(hostId: string, id: string): string {
  return hostId === LOCAL_T3_HOST_ID ? id : `${hostId}:${id}`;
}

/** The id T3 itself knows a thread or project by. */
export function rawId(hostId: string, id: string): string {
  const prefix = `${hostId}:`;
  return hostId !== LOCAL_T3_HOST_ID && id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/**
 * A T3 thread as Dispatch holds it. Detail that only a thread snapshot
 * carries (the questions, the last message, the first user message) is kept
 * from `previous` as long as it still applies to the thread's status.
 */
export function toAgentThread(
  host: DispatchHost,
  thread: T3Thread,
  slot: string,
  previous: AgentThread | undefined,
): AgentThread {
  const asking = thread.status === 'question';
  const stopped = NEEDS_YOU.includes(thread.status);
  return {
    id: scopedId(host.id, thread.id),
    hostId: host.id,
    hostLabel: host.label,
    available: true,
    projectId: scopedId(host.id, thread.projectId),
    slot,
    title: thread.title,
    branch: thread.branch,
    createdAt: thread.createdAt,
    lastActivityAt: thread.lastActivityAt,
    open: thread.status !== 'settled',
    status: thread.status,
    interactionMode: thread.interactionMode,
    model: thread.model,
    modelInstance: thread.modelInstance,
    effort: thread.effort,
    pullRequests: thread.pullRequests,
    firstUserMessage: previous?.firstUserMessage ?? '',
    questionRequestId: asking ? (previous?.questionRequestId ?? null) : null,
    questions: asking ? (previous?.questions ?? []) : [],
    lastAgentMessage: stopped ? (previous?.lastAgentMessage ?? null) : null,
  };
}

const knownPullRequests = new WeakMap<PullRequestWithChecks, KnownPullRequest>();

export function toKnownPullRequest(pr: PullRequestWithChecks): KnownPullRequest {
  const cached = knownPullRequests.get(pr);
  if (cached) return cached;
  const p = pr.pullRequest;
  const known: KnownPullRequest = {
    number: p.number,
    url: p.htmlUrl,
    state: p.mergedAt ? 'merged' : p.state === 'open' ? 'open' : 'closed',
    title: p.title,
    isDraft: p.isDraft,
    branch: p.headRef,
    workItemIds: detectWorkItemIds(p),
    checks: {
      passed: pr.passedCount,
      failed: pr.failedCheckNames.length,
      pending: pr.pendingCheckNames.length,
      total: pr.totalCheckCount,
    },
  };
  knownPullRequests.set(pr, known);
  return known;
}

/** The slot pattern as a regular expression; `null` for none, or one that does not compile. */
export function compileSlotPattern(pattern: string | undefined): RegExp | null {
  const trimmed = pattern?.trim();
  if (!trimmed) return null;
  try {
    return new RegExp(trimmed);
  } catch {
    return null;
  }
}

function sameOverview(a: Overview | null, b: Overview): boolean {
  if (!a) return false;
  const { generatedAt: _a, ...left } = a;
  const { generatedAt: _b, ...right } = b;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Rebuild the overview from what the stores hold now. Called after every
 * change to one of its inputs; an identical result leaves the store alone, so
 * nothing re-renders.
 */
export function recomputeOverview(): void {
  const dispatch = useDispatchStore.getState();
  const prs = usePrStore.getState();
  const tracked = useWorkItemsStore.getState().trackedWorkItemIds;
  const { overview, dequeue } = buildOverview({
    items: dispatch.items,
    threads: dispatch.threads,
    projects: dispatch.projects,
    pullRequests: [...prs.pullRequests, ...prs.closedPullRequests].map(toKnownPullRequest),
    queued: tracked,
    hiddenSuggestions: dispatch.hiddenSuggestions,
    manualLinks: dispatch.manualLinks,
    slotPattern: compileSlotPattern(useSettingsStore.getState().settings.agents?.t3SlotPattern),
  });
  if (!sameOverview(dispatch.overview, overview)) {
    dispatch.setOverview(overview);
    notifyNew(overview, !everySourceRead());
  }
  // An agent picked these up; the queue has done its job.
  for (const id of dequeue) {
    if (tracked.has(id)) toggleTrackedWorkItem(id);
  }
}

/** Sources that have been read to the end at least once this session. */
const sourcesRead = new Set<string>();
const ADO_SOURCE = 'ado';

/**
 * True once Azure DevOps and every host have been read, detail included.
 * Until then the overview is still filling up, and nothing in it is news.
 */
function everySourceRead(): boolean {
  const hosts = configuredHosts(useSettingsStore.getState().settings);
  return sourcesRead.has(ADO_SOURCE) && hosts.every((host) => sourcesRead.has(host.id));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── T3 hosts ────────────────────────────────────────────────

interface HostState {
  sequence: number | null;
  /** `lastActivityAt|status` each thread's detail was last read at. */
  detailVersions: Map<string, string>;
  /** Threads whose first user message is in (or known to be absent). */
  firstMessagesRead: Set<string>;
  inFlight: Promise<void> | null;
}

const hostStates = new Map<string, HostState>();

function stateOf(hostId: string): HostState {
  let state = hostStates.get(hostId);
  if (!state) {
    state = {
      sequence: null,
      detailVersions: new Map(),
      firstMessagesRead: new Set(),
      inFlight: null,
    };
    hostStates.set(hostId, state);
  }
  return state;
}

/** Forget what was read from every host (tests, and hosts that were removed). */
export function resetHostSync(): void {
  hostStates.clear();
  sourcesRead.clear();
}

const DETAIL_BATCH = 4;

function threadsOf(hostId: string): AgentThread[] {
  return useDispatchStore.getState().threads.filter((thread) => thread.hostId === hostId);
}

async function readFirstMessages(host: DispatchHost, state: HostState): Promise<void> {
  const missing = threadsOf(host.id).filter((thread) => !state.firstMessagesRead.has(thread.id));
  if (missing.length === 0) return;
  let found: Record<string, string>;
  try {
    found = await t3FirstUserMessages(
      hostRef(host),
      missing.map((thread) => rawId(host.id, thread.id)),
    );
  } catch {
    return;
  }
  const patches = new Map<string, Partial<AgentThread>>();
  for (const [id, text] of Object.entries(found)) {
    const threadId = scopedId(host.id, id);
    state.firstMessagesRead.add(threadId);
    if (text) patches.set(threadId, { firstUserMessage: text });
  }
  if (patches.size === 0) return;
  useDispatchStore.getState().patchThreads(patches);
  recomputeOverview();
}

/** Questions and the agent's last message, for the threads that wait on you. */
async function readDetails(host: DispatchHost, state: HostState): Promise<void> {
  const version = (thread: AgentThread) => `${thread.lastActivityAt}|${thread.status}`;
  const stale = threadsOf(host.id).filter(
    (thread) =>
      thread.open &&
      NEEDS_YOU.includes(thread.status) &&
      state.detailVersions.get(thread.id) !== version(thread),
  );
  if (stale.length === 0) return;
  const patches = new Map<string, Partial<AgentThread>>();
  for (let start = 0; start < stale.length; start += DETAIL_BATCH) {
    await Promise.all(
      stale.slice(start, start + DETAIL_BATCH).map(async (thread) => {
        try {
          const detail = await t3ThreadDetail(hostRef(host), rawId(host.id, thread.id));
          state.detailVersions.set(thread.id, version(thread));
          patches.set(thread.id, {
            lastAgentMessage: detail.lastAgentMessage,
            questionRequestId: thread.status === 'question' ? detail.questionRequestId : null,
            questions: thread.status === 'question' ? detail.questions : [],
          });
        } catch {
          // Keep what was known; the next poll tries again.
        }
      }),
    );
  }
  if (patches.size === 0) return;
  useDispatchStore.getState().patchThreads(patches);
  recomputeOverview();
}

async function pollHost(host: DispatchHost, state: HostState, force: boolean): Promise<void> {
  const store = useDispatchStore.getState;
  const lastSeen = store().hosts.find((h) => h.id === host.id)?.at ?? null;
  let snapshot: Awaited<ReturnType<typeof t3Snapshot>>;
  try {
    snapshot = await t3Snapshot(hostRef(host), force ? null : state.sequence);
  } catch (error) {
    store().setHostStatus({
      id: host.id,
      label: host.label,
      ok: false,
      at: lastSeen,
      error: errorText(error),
    });
    recomputeOverview();
    return;
  }

  if (snapshot.changed) {
    state.sequence = snapshot.sequence;
    if (force) state.detailVersions.clear();
    const previous = new Map(threadsOf(host.id).map((thread) => [thread.id, thread]));
    const titles = new Map(snapshot.projects.map((project) => [project.id, project.title]));
    const threads = snapshot.threads.map((thread) =>
      toAgentThread(
        host,
        thread,
        titles.get(thread.projectId) ?? 'unknown',
        previous.get(scopedId(host.id, thread.id)),
      ),
    );
    const projects = snapshot.projects.map(
      (project): AgentProject => ({
        id: scopedId(host.id, project.id),
        hostId: host.id,
        hostLabel: host.label,
        available: true,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
      }),
    );
    store().setHostSnapshot(host.id, threads, projects);
  }
  store().setHostStatus({
    id: host.id,
    label: host.label,
    ok: true,
    at: new Date().toISOString(),
    error: null,
  });
  recomputeOverview();

  await readFirstMessages(host, state);
  await readDetails(host, state);
}

/**
 * Read one host. A poll that is already running is shared; a forced one
 * (Refresh) waits for it and then reads everything again.
 */
export async function syncHost(host: DispatchHost, force = false): Promise<void> {
  const state = stateOf(host.id);
  if (state.inFlight) {
    if (!force) return state.inFlight;
    await state.inFlight.catch(() => {});
  }
  const poll = pollHost(host, state, force).finally(() => {
    if (state.inFlight === poll) state.inFlight = null;
    sourcesRead.add(host.id);
  });
  state.inFlight = poll;
  return poll;
}

// ── Azure DevOps ────────────────────────────────────────────

let cachedClient: { key: string; client: AdoClient } | null = null;

function adoClient(ado: AppSettings['azureDevOps']): AdoClient | null {
  const hasCredentials = ado.authMethod === 'azCli' || !!ado.personalAccessToken;
  if (!ado.organization || !ado.project || !hasCredentials) return null;
  const key = [ado.organization, ado.project, ado.authMethod, ado.personalAccessToken].join('|');
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      client: new AdoClient(
        ado.organization,
        ado.project,
        ado.personalAccessToken ?? '',
        ado.authMethod,
      ),
    };
  }
  return cachedClient.client;
}

/** The client Dispatch reads and writes ADO with, or `null` when ADO is not set up. */
export function dispatchAdoClient(): AdoClient | null {
  return adoClient(useSettingsStore.getState().settings.azureDevOps);
}

let itemsInFlight: Promise<void> | null = null;

async function loadItems(): Promise<void> {
  const store = useDispatchStore.getState;
  const ado = useSettingsStore.getState().settings.azureDevOps;
  const client = adoClient(ado);
  if (!client) {
    store().setItems([], { ok: false, at: null, error: 'Azure DevOps is not set up.' });
    recomputeOverview();
    return;
  }
  try {
    const tracked = [...useWorkItemsStore.getState().trackedWorkItemIds];
    const items = await loadDispatchItems(
      client,
      { organization: ado.organization, project: ado.project },
      tracked,
    );
    store().setItems(items, { ok: true, at: new Date().toISOString(), error: null });
  } catch (error) {
    store().setAdoStatus({ ok: false, at: store().ado.at, error: errorText(error) });
  }
  recomputeOverview();
}

/** Read my open items from Azure DevOps. Concurrent calls share one read. */
export function syncItems(): Promise<void> {
  itemsInFlight ??= loadItems().finally(() => {
    itemsInFlight = null;
    sourcesRead.add(ADO_SOURCE);
  });
  return itemsInFlight;
}

/** Read everything again: after an action changed T3 or ADO, or on Refresh. */
export function syncAll(force = true): void {
  void syncItems();
  for (const host of configuredHosts(useSettingsStore.getState().settings)) {
    void syncHost(host, force);
  }
}
