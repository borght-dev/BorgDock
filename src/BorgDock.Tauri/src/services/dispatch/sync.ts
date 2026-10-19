import { toggleTrackedWorkItem } from '@/components/work-items/work-item-toggles';
import { AdoClient } from '@/services/ado/client';
import {
  type T3ConversationReferences,
  type T3Thread,
  t3ConversationReferences,
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
import { forgetHostsExcept, rememberHost } from './host-memory';
import { configuredHosts, type DispatchHost, hostRef, isRemote, rawId, scopedId } from './hosts';
import { loadDispatchItems } from './items';
import { candidateRepositories, fetchFromGitHub, lookUpLinkedPullRequests } from './linked-prs';
import { notifyNew } from './notifier';
import {
  type AgentProject,
  type AgentThread,
  type KnownPullRequest,
  NEEDS_YOU,
  type Overview,
} from './types';

/**
 * A T3 thread as Dispatch holds it. Detail that only a thread snapshot
 * carries (the questions, the last message, the first user message) is kept
 * from `previous` as long as it still applies to the thread's status. A
 * subagent never settles in T3; Dispatch holds it as settled, since its root
 * thread is the one that works and waits. Its branch and pull requests are
 * those of the checkout it was started in, not its own, so only its
 * conversation tells what it worked on.
 */
export function toAgentThread(
  host: DispatchHost,
  thread: T3Thread,
  slot: string,
  previous: AgentThread | undefined,
): AgentThread {
  const subagentOf = thread.subagentOf ? scopedId(host.id, thread.subagentOf) : null;
  const status = subagentOf ? 'settled' : thread.status;
  const asking = status === 'question';
  const stopped = NEEDS_YOU.includes(status);
  return {
    id: scopedId(host.id, thread.id),
    hostId: host.id,
    hostLabel: host.label,
    available: true,
    projectId: scopedId(host.id, thread.projectId),
    slot,
    title: thread.title,
    branch: subagentOf ? null : thread.branch,
    createdAt: thread.createdAt,
    lastActivityAt: thread.lastActivityAt,
    updatedAt: thread.updatedAt,
    open: status !== 'settled',
    status,
    interactionMode: thread.interactionMode,
    model: thread.model,
    modelInstance: thread.modelInstance,
    effort: thread.effort,
    pullRequests: subagentOf ? [] : thread.pullRequests,
    firstUserMessage: previous?.firstUserMessage ?? '',
    conversationReferences: previous?.conversationReferences,
    subagentOf,
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
    approved: p.reviewStatus === 'approved',
    mergedAt: p.mergedAt ?? null,
  };
  knownPullRequests.set(pr, known);
  return known;
}

/**
 * The pull requests BorgDock polls, joined with those ADO links on the items.
 * A polled one keeps its live checks and learns which items link it.
 */
export function mergePullRequests(
  polled: readonly KnownPullRequest[],
  linked: readonly KnownPullRequest[],
): KnownPullRequest[] {
  const byUrl = new Map(polled.map((pr) => [pr.url.toLowerCase(), pr]));
  for (const pr of linked) {
    const key = pr.url.toLowerCase();
    const seen = byUrl.get(key);
    if (!seen) {
      byUrl.set(key, pr);
      continue;
    }
    const extra = pr.workItemIds.filter((id) => !seen.workItemIds.includes(id));
    if (extra.length > 0) byUrl.set(key, { ...seen, workItemIds: [...seen.workItemIds, ...extra] });
  }
  return [...byUrl.values()];
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
    pullRequests: mergePullRequests(
      [...prs.pullRequests, ...prs.closedPullRequests].map(toKnownPullRequest),
      dispatch.linkedPullRequests,
    ),
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
  /** The address this state was read from; a host that moved starts over. */
  address: string;
  sequence: number | null;
  /** `lastActivityAt|status` each thread's detail was last read at. */
  detailVersions: Map<string, string>;
  referenceVersions: Map<string, string>;
  inFlight: Promise<void> | null;
}

const hostStates = new Map<string, HostState>();

function addressOf(host: DispatchHost): string {
  return host.baseUrl ?? '';
}

function stateOf(host: DispatchHost): HostState {
  let state = hostStates.get(host.id);
  if (!state) {
    state = {
      address: addressOf(host),
      sequence: null,
      detailVersions: new Map(),
      referenceVersions: new Map(),
      inFlight: null,
    };
    hostStates.set(host.id, state);
  }
  return state;
}

/** False for a poll whose host was removed, or moved, while it was under way. */
function stillFollowed(host: DispatchHost, state: HostState): boolean {
  return hostStates.get(host.id) === state;
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

/** Open threads first, then the most recently active: a remote host answers a few per poll. */
function openThenRecent(a: AgentThread, b: AgentThread): number {
  return Number(b.open) - Number(a.open) || b.lastActivityAt.localeCompare(a.lastActivityAt);
}

async function readConversationReferences(host: DispatchHost, state: HostState): Promise<void> {
  const version = (thread: AgentThread) => thread.updatedAt ?? thread.lastActivityAt;
  const missing = threadsOf(host.id)
    .filter((thread) => state.referenceVersions.get(thread.id) !== version(thread))
    .sort(openThenRecent);
  if (missing.length === 0) return;
  let found: Record<string, T3ConversationReferences>;
  try {
    found = await t3ConversationReferences(
      hostRef(host),
      missing.map((thread) => rawId(host.id, thread.id)),
    );
  } catch {
    return;
  }
  if (!stillFollowed(host, state)) return;
  const patches = new Map<string, Partial<AgentThread>>();
  const requested = new Map(missing.map((thread) => [thread.id, thread]));
  for (const [id, references] of Object.entries(found)) {
    const threadId = scopedId(host.id, id);
    const thread = requested.get(threadId);
    if (!thread) continue;
    state.referenceVersions.set(threadId, version(thread));
    patches.set(threadId, { conversationReferences: references });
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
    if (!stillFollowed(host, state)) return;
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
  if (!stillFollowed(host, state)) return;

  if (snapshot.changed) {
    state.sequence = snapshot.sequence;
    if (force) {
      state.detailVersions.clear();
      state.referenceVersions.clear();
    }
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
    if (isRemote(host)) void rememberHost(host.id);
  }
  store().setHostStatus({
    id: host.id,
    label: host.label,
    ok: true,
    at: new Date().toISOString(),
    error: null,
  });
  recomputeOverview();

  await readConversationReferences(host, state);
  await readDetails(host, state);
}

/**
 * Read one host. A poll that is already running is shared; a forced one
 * (Refresh) waits for it and then reads everything again.
 */
export async function syncHost(host: DispatchHost, force = false): Promise<void> {
  const state = stateOf(host);
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

/**
 * Follow the host list in settings after it changed: forget the hosts that
 * left or moved to another address, then read every host.
 */
export function followHostList(): void {
  const hosts = configuredHosts(useSettingsStore.getState().settings);
  const addresses = new Map(hosts.map((host) => [host.id, addressOf(host)]));
  for (const [id, state] of hostStates) {
    if (addresses.get(id) === state.address) continue;
    hostStates.delete(id);
    sourcesRead.delete(id);
  }
  const followed = hosts.map((host) => host.id);
  useDispatchStore.getState().retainHosts(followed);
  void forgetHostsExcept(followed);
  recomputeOverview();
  for (const host of hosts) void syncHost(host);
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
let itemsRefreshRequested = false;
let linkedInFlight: Promise<void> | null = null;

/** Read the GitHub state of the pull requests ADO links on the items. */
function refreshLinkedPullRequests(): Promise<void> {
  linkedInFlight ??= (async () => {
    const store = useDispatchStore.getState;
    const candidates = candidateRepositories(useSettingsStore.getState().settings.repos);
    try {
      const { pullRequests, repositories } = await lookUpLinkedPullRequests(
        store().items,
        candidates,
        store().linkedRepositories,
        fetchFromGitHub,
      );
      store().setLinkedPullRequests(pullRequests, repositories);
      recomputeOverview();
    } catch {
      // The items show without it; the next poll tries again.
    }
  })().finally(() => {
    linkedInFlight = null;
  });
  return linkedInFlight;
}

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
    void refreshLinkedPullRequests();
  } catch (error) {
    store().setAdoStatus({ ok: false, at: store().ado.at, error: errorText(error) });
  }
  recomputeOverview();
}

/** Share polls; a forced refresh during a read queues one fresh read after it. */
export function syncItems(force = false): Promise<void> {
  if (itemsInFlight) {
    if (force) itemsRefreshRequested = true;
    return itemsInFlight;
  }
  itemsInFlight = (async () => {
    do {
      itemsRefreshRequested = false;
      await loadItems();
    } while (itemsRefreshRequested);
  })().finally(() => {
    itemsInFlight = null;
    sourcesRead.add(ADO_SOURCE);
  });
  return itemsInFlight;
}

/** Read everything again: after an action changed T3 or ADO, or on Refresh. */
export function syncAll(force = true): void {
  void syncItems(force);
  for (const host of configuredHosts(useSettingsStore.getState().settings)) {
    void syncHost(host, force);
  }
}
