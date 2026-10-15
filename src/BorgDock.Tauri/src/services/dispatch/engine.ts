import { LOCAL_T3_HOST_ID } from '@/services/t3/api';
import { guessItem, linkThreads } from './link';
import {
  type AgentProject,
  type AgentThread,
  type Bay,
  type DispatchItem,
  type ItemOverview,
  type KnownPullRequest,
  NEEDS_YOU,
  type Overview,
  type PullRequestState,
  type Slot,
  type Suggestion,
  THREAD_STATUS_LABEL,
  type ThreadPullRequest,
  type UnitPullRequest,
} from './types';
import { type Drift, driftOf, evidenceOf, latestMessage, verdictOf } from './verdict';

export interface EngineInput {
  items: readonly DispatchItem[];
  threads: readonly AgentThread[];
  projects: readonly AgentProject[];
  /** Pull requests BorgDock polls from GitHub; they carry live checks. */
  pullRequests: readonly KnownPullRequest[];
  /** Items marked Up next (the track star). */
  queued: ReadonlySet<number>;
  /** Ids of the suggestions the user hid. */
  hiddenSuggestions: ReadonlySet<string>;
  /** Thread id to item id, for links made or removed by hand. */
  manualLinks: ReadonlyMap<string, number | null>;
  /** Only projects whose title matches count as slots; `null` takes every project. */
  slotPattern: RegExp | null;
  now?: Date;
}

const MAX_THREADS_PER_ITEM = 10;
const HUMAN_NEEDED_STATES = new Set(['Needs Human']);

const PULL_REQUEST_RANK: Record<PullRequestState, number> = {
  open: 0,
  merged: 1,
  unknown: 2,
  closed: 3,
};

function needsYou(thread: AgentThread): boolean {
  return thread.open && NEEDS_YOU.includes(thread.status);
}

function namesItem(item: DispatchItem, text: string): boolean {
  return new RegExp(`(\\b|AB#?)${item.id}\\b`).test(text);
}

/** A thread touches many pull requests; only one that names the item, or that ADO links, is the item's. */
function belongsTo(item: DispatchItem, pr: ThreadPullRequest): boolean {
  if (item.linkedPullRequests.some((link) => link.number === pr.number)) return true;
  return namesItem(item, `${pr.title} ${pr.headBranch ?? ''}`);
}

function pullRequestKey(pr: { url: string; number: number }): string {
  return pr.url.toLowerCase() || `#${pr.number}`;
}

function sameUrl(a: string, b: string): boolean {
  return a !== '' && a.toLowerCase() === b.toLowerCase();
}

/** Every pull request of the item, open first, then merged, newest first within each. */
function itemPullRequests(
  item: DispatchItem,
  threads: readonly AgentThread[],
  known: readonly KnownPullRequest[],
): UnitPullRequest[] {
  const candidates = new Map<string, UnitPullRequest>();
  const add = (pr: UnitPullRequest) => candidates.set(pullRequestKey(pr), pr);

  for (const pr of threads.flatMap((t) => t.pullRequests)) {
    if (!belongsTo(item, pr)) continue;
    const live = known.find((k) => sameUrl(k.url, pr.url));
    add({
      number: pr.number,
      url: pr.url,
      state: live?.state ?? pr.state,
      title: live?.title ?? pr.title,
      isDraft: live?.isDraft ?? pr.isDraft,
      branch: live?.branch ?? pr.headBranch,
      checks: live?.checks ?? null,
      approved: live?.approved ?? false,
      mergedAt: live?.mergedAt ?? null,
      shared: false,
    });
  }
  for (const pr of known) {
    if (!pr.workItemIds.includes(item.id)) continue;
    add({
      number: pr.number,
      url: pr.url,
      state: pr.state,
      title: pr.title,
      isDraft: pr.isDraft,
      branch: pr.branch,
      checks: pr.checks,
      approved: pr.approved,
      mergedAt: pr.mergedAt,
      shared: false,
    });
  }

  // A pull request can serve two items; the one whose title names the item is its own.
  const own = (pr: UnitPullRequest) => (namesItem(item, pr.title) ? 0 : 1);
  return [...candidates.values()].sort(
    (a, b) =>
      PULL_REQUEST_RANK[a.state] - PULL_REQUEST_RANK[b.state] ||
      own(a) - own(b) ||
      b.number - a.number,
  );
}

/** The drift as a suggestion: stable while its evidence holds, so "Keep" sticks. */
function suggestionOf(item: DispatchItem, drift: Drift | null): Suggestion | null {
  return drift
    ? { id: `${item.id}:${drift.evidence}:${drift.to}`, to: drift.to, reason: drift.reason }
    : null;
}

function waitingFor(item: DispatchItem, threads: readonly AgentThread[]): string | null {
  if (HUMAN_NEEDED_STATES.has(item.state)) return `ADO says ${item.state}`;
  const thread = threads.find(needsYou);
  return thread ? `${THREAD_STATUS_LABEL[thread.status]} in ${thread.slot}` : null;
}

/**
 * Marks the pull requests that belong to several of my items and name none of
 * them in title or branch, like the plan of an epic linked on every PBI: they
 * say nothing about one item's own state.
 */
function markShared(perItem: Map<DispatchItem, UnitPullRequest[]>): void {
  const holders = new Map<string, number>();
  for (const pullRequests of perItem.values()) {
    for (const pr of pullRequests) {
      holders.set(pullRequestKey(pr), (holders.get(pullRequestKey(pr)) ?? 0) + 1);
    }
  }
  for (const [item, pullRequests] of perItem) {
    perItem.set(
      item,
      pullRequests.map((pr) => {
        const shared =
          (holders.get(pullRequestKey(pr)) ?? 0) > 1 &&
          !namesItem(item, `${pr.title} ${pr.branch ?? ''}`);
        return shared ? { ...pr, shared } : pr;
      }),
    );
  }
}

function bayOf(
  item: DispatchItem,
  threads: readonly AgentThread[],
  waiting: string | null,
  suggestion: Suggestion | null,
  queued: boolean,
): Bay {
  if (waiting) return 'waiting';
  if (suggestion) return 'drift';
  if (threads.some((t) => t.open && t.status === 'running')) return 'working';
  if (queued) return 'next';
  if (item.stateCategory === 'Resolved') return 'handed';
  return threads.length > 0 ? 'paused' : 'idle';
}

const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** This machine's slots come first, then the other hosts by name. */
function slotOrder(a: AgentProject, b: AgentProject): number {
  const localFirst = Number(b.hostId === LOCAL_T3_HOST_ID) - Number(a.hostId === LOCAL_T3_HOST_ID);
  return localFirst || naturalOrder(a.hostLabel, b.hostLabel) || naturalOrder(a.title, b.title);
}

/**
 * The overview: every item with its threads, pull request, suggestion and bay,
 * plus the slots and the open threads that belong to no item. `dequeue` lists
 * the Up next items an agent has picked up, so the caller can take them off
 * the queue.
 */
export function buildOverview(input: EngineInput): { overview: Overview; dequeue: number[] } {
  const now = input.now ?? new Date();
  const slotProjects = input.projects.filter(
    (project) => input.slotPattern === null || input.slotPattern.test(project.title),
  );
  const slotIds = new Set(slotProjects.map((project) => project.id));
  const threads = input.threads.filter((thread) => slotIds.has(thread.projectId));
  const links = linkThreads(input.items, threads, input.manualLinks);
  const dequeue: number[] = [];

  const pullRequestsOf = new Map(
    input.items.map((item) => [
      item,
      itemPullRequests(item, links.threadsByItem.get(item.id) ?? [], input.pullRequests),
    ]),
  );
  markShared(pullRequestsOf);

  const items = input.items.map((item): ItemOverview => {
    const itemThreads = links.threadsByItem.get(item.id) ?? [];
    const pullRequests = pullRequestsOf.get(item) ?? [];
    const pullRequest = pullRequests.find((pr) => !pr.shared) ?? pullRequests[0] ?? null;
    const found = driftOf({ item, threads: itemThreads, pullRequests, now });
    let suggestion = suggestionOf(item, found);
    if (suggestion && input.hiddenSuggestions.has(suggestion.id)) suggestion = null;
    const drift = suggestion ? found : null;
    const waiting = waitingFor(item, itemThreads);

    // Once an agent works on a queued item, the queue has done its job.
    const pickedUp = input.queued.has(item.id) && itemThreads.some((t) => t.open);
    if (pickedUp) dequeue.push(item.id);
    const queued = input.queued.has(item.id) && !pickedUp;

    const facts = { item, threads: itemThreads, pullRequests, now, drift };
    return {
      item,
      bay: bayOf(item, itemThreads, waiting, suggestion, queued),
      waitingFor: waiting,
      suggestion,
      pullRequest,
      pullRequests,
      threads: itemThreads.slice(0, MAX_THREADS_PER_ITEM),
      queued,
      verdict: verdictOf(facts),
      evidence: evidenceOf(facts),
      latest: latestMessage(item, itemThreads),
    };
  });

  const myItemIds = new Set(input.items.map((item) => item.id));
  const slots = [...slotProjects].sort(slotOrder).map((project): Slot => {
    const open = threads.filter((t) => t.open && t.projectId === project.id);
    const mine = open.find((t) => myItemIds.has(links.itemOfThread.get(t.id) ?? -1));
    return {
      id: project.id,
      hostId: project.hostId,
      hostLabel: project.hostLabel,
      available: project.available,
      name: project.title,
      workspaceRoot: project.workspaceRoot,
      state: open.length === 0 ? 'free' : mine ? 'mine' : 'busy',
      itemId: mine ? (links.itemOfThread.get(mine.id) ?? null) : null,
      running: open.some((t) => t.status === 'running'),
      needsYou: mine !== undefined && needsYou(mine),
    };
  });

  const unlinkedThreads = [...links.unlinked]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .map((thread) => ({ ...thread, guessItemId: guessItem(thread, input.items) }));

  return {
    overview: { generatedAt: now.toISOString(), items, unlinkedThreads, slots },
    dequeue,
  };
}
