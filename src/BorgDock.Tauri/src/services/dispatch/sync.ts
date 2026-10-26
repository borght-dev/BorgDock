import { toggleTrackedWorkItem } from '@/components/work-items/work-item-toggles';
import type { AdoClient } from '@/services/ado/client';
import { adoClient } from '@/services/ado/singleton';
import {
  type T3ConversationReferences,
  type T3Thread,
  t3ConversationReferences,
  t3Environment,
  t3Snapshot,
  t3ThreadDetail,
} from '@/services/t3/api';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequestWithChecks } from '@/types';
import { shareValue } from '@/utils/structural-sharing';
import { buildOverview } from './engine';
import { forgetHostsExcept, rememberHost } from './host-memory';
import { configuredHosts, type DispatchHost, hostRef, isRemote, rawId, scopedId } from './hosts';
import { loadContextItems, loadDispatchItems } from './items';
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
  return shareValue(left, right) === left;
}

/**
 * Rebuild the overview from what the stores hold now. Called after every
 * change to one of its inputs; an identical result leaves the store alone, so
 * nothing re-renders.
 */
let overviewInputs: unknown[] | null = null;
let computedOverview: Overview | null = null;

export function recomputeOverview(): void {
  const dispatch = useDispatchStore.getState();
  const prs = usePrStore.getState();
  const tracked = useWorkItemsStore.getState().trackedWorkItemIds;
  const slotPattern = useSettingsStore.getState().settings.agents?.t3SlotPattern;
  const inputs = [
    dispatch.items,
    dispatch.threads,
    dispatch.projects,
    prs.pullRequests,
    prs.closedPullRequests,
    dispatch.linkedPullRequests,
    tracked,
    dispatch.hiddenSuggestions,
    dispatch.manualLinks,
    slotPattern,
    dispatch.contextItems,
    Math.floor(Date.now() / 60_000),
  ];
  if (
    dispatch.overview === computedOverview &&
    overviewInputs &&
    inputs.every((value, i) => value === overviewInputs![i])
  )
    return;
  overviewInputs = inputs;
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
    slotPattern: compileSlotPattern(slotPattern),
    contextItems: dispatch.contextItems,
  });
  if (!sameOverview(dispatch.overview, overview)) {
    dispatch.setOverview(overview);
    notifyNew(overview, !everySourceRead());
  }
  computedOverview = useDispatchStore.getState().overview;
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
export function everySourceRead(): boolean {
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
  /** The T3 install behind the address, once read. */
  environmentId: string | null;
  readingEnvironment: boolean;
  sequence: number | null;
  /** `lastActivityAt|status` each thread's detail was last read at. */
  detailVersions: Map<string, string>;
  referenceVersions: Map<string, string>;
  inFlight: Promise<void> | null;
  refreshRequested: boolean;
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
      environmentId: null,
      readingEnvironment: false,
      sequence: null,
      detailVersions: new Map(),
      referenceVersions: new Map(),
      inFlight: null,
      refreshRequested: false,
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
  syncGeneration++;
  itemsInFlight = null;
  itemsConnection = null;
  linkedInFlight = null;
  itemsRefreshRequested = false;
  overviewInputs = null;
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
          if (!stillFollowed(host, state)) return;
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
    if (!stillFollowed(host, state)) return;
  }
  if (!stillFollowed(host, state) || patches.size === 0) return;
  useDispatchStore.getState().patchThreads(patches);
  recomputeOverview();
}

/** Learn which T3 install the host is, once per address. */
async function readEnvironment(host: DispatchHost, state: HostState): Promise<void> {
  if (state.environmentId || state.readingEnvironment) return;
  state.readingEnvironment = true;
  try {
    const environmentId = await t3Environment(hostRef(host));
    if (!stillFollowed(host, state)) return;
    state.environmentId = environmentId;
    const store = useDispatchStore.getState();
    const status = store.hosts.find((h) => h.id === host.id);
    if (status) store.setHostStatus({ ...status, environmentId });
  } catch {
    // Read again after the next poll that answers.
  } finally {
    state.readingEnvironment = false;
  }
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
      environmentId: state.environmentId,
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
    environmentId: state.environmentId,
  });
  recomputeOverview();
  void readEnvironment(host, state);

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
    if (force) state.refreshRequested = true;
    return state.inFlight;
  }
  const poll = (async () => {
    let refresh = force;
    do {
      state.refreshRequested = false;
      await pollHost(host, state, refresh);
      refresh = state.refreshRequested;
    } while (refresh && stillFollowed(host, state));
  })().finally(() => {
    if (state.inFlight === poll) state.inFlight = null;
    if (stillFollowed(host, state)) sourcesRead.add(host.id);
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

/** The ids of the items a workstream links; read with the items, never shown in Dispatch. */
let contextIdSource: () => readonly number[] = () => [];

/** Let another feature (workstreams) name the extra items it needs read. */
export function followContextItems(source: () => readonly number[]): void {
  contextIdSource = source;
}

/** The client Dispatch reads and writes ADO with, or `null` when ADO is not set up. */
export function dispatchAdoClient(): AdoClient | null {
  return adoClient(useSettingsStore.getState().settings.azureDevOps);
}

let syncGeneration = 0;
let itemsConnection: string | null = null;
let itemsInFlight: Promise<void> | null = null;
let itemsRefreshRequested = false;
let linkedInFlight: Promise<void> | null = null;

/** Read the GitHub state of the pull requests ADO links on the items. */
function refreshLinkedPullRequests(): Promise<void> {
  if (linkedInFlight) return linkedInFlight;
  const job = (async () => {
    const store = useDispatchStore.getState;
    const generation = syncGeneration;
    const candidates = candidateRepositories(useSettingsStore.getState().settings.repos);
    try {
      const { pullRequests, repositories } = await lookUpLinkedPullRequests(
        [...store().items, ...store().contextItems],
        candidates,
        store().linkedRepositories,
        fetchFromGitHub,
      );
      if (generation !== syncGeneration) return;
      store().setLinkedPullRequests(pullRequests, repositories);
      recomputeOverview();
    } catch {
      // The items show without it; the next poll tries again.
    }
  })().finally(() => {
    if (linkedInFlight === job) linkedInFlight = null;
  });
  linkedInFlight = job;
  return job;
}

async function loadItems(): Promise<void> {
  const generation = syncGeneration;
  const store = useDispatchStore.getState;
  const ado = useSettingsStore.getState().settings.azureDevOps;
  const client = adoClient(ado);
  if (!client) {
    store().setItems([], { ok: false, at: null, error: 'Azure DevOps is not set up.' });
    store().setContextItems([], []);
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
    if (generation !== syncGeneration) return;
    const listed = new Set(items.map((item) => item.id));
    const contextIds = [...new Set(contextIdSource())].filter((id) => !listed.has(id));
    const context =
      contextIds.length === 0
        ? { items: [], missing: [] }
        : await loadContextItems(
            client,
            { organization: ado.organization, project: ado.project },
            contextIds,
          ).catch(() => null);
    if (generation !== syncGeneration) return;
    store().setItems(items, { ok: true, at: new Date().toISOString(), error: null });
    if (context) store().setContextItems(context.items, context.missing);
    void refreshLinkedPullRequests();
  } catch (error) {
    if (generation !== syncGeneration) return;
    store().setAdoStatus({ ok: false, at: store().ado.at, error: errorText(error) });
  }
  recomputeOverview();
}

/** Share polls; a forced refresh during a read queues one fresh read after it. */
export function syncItems(force = false): Promise<void> {
  const ado = useSettingsStore.getState().settings.azureDevOps;
  const connection = JSON.stringify([
    ado.organization,
    ado.project,
    ado.authMethod,
    ado.personalAccessToken,
  ]);
  if (itemsConnection !== null && itemsConnection !== connection) {
    syncGeneration++;
    itemsInFlight = null;
    linkedInFlight = null;
    sourcesRead.delete(ADO_SOURCE);
    useDispatchStore.getState().setItems([], { ok: false, at: null, error: null });
    useDispatchStore.getState().setContextItems([], []);
    useDispatchStore.getState().setLinkedPullRequests([], {});
    recomputeOverview();
  }
  itemsConnection = connection;
  if (itemsInFlight) {
    if (force) itemsRefreshRequested = true;
    return itemsInFlight;
  }
  const generation = syncGeneration;
  const poll = (async () => {
    do {
      itemsRefreshRequested = false;
      await loadItems();
    } while (itemsRefreshRequested && generation === syncGeneration);
  })().finally(() => {
    if (itemsInFlight === poll) itemsInFlight = null;
    if (generation === syncGeneration) sourcesRead.add(ADO_SOURCE);
  });
  itemsInFlight = poll;
  return poll;
}

/** Read everything again: after an action changed T3 or ADO, or on Refresh. */
export function syncAll(force = true): void {
  void syncItems(force);
  for (const host of configuredHosts(useSettingsStore.getState().settings)) {
    void syncHost(host, force);
  }
}
