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

const STALE_AFTER_DAYS = 5;
const MS_PER_DAY = 86_400_000;
const MAX_THREADS_PER_ITEM = 10;

const IN_PROGRESS_NAMES = ['Development In Progress', 'In Progress', 'Active', 'Committed'];
const MERGED_NAMES = ['Ready For QA', 'Resolved'];
const REVIEW_NAME = /\breview\b/i;
const HOLD_STATES = new Set(['On Hold', 'Awaiting Answers', 'Blocked']);
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

/** A thread touches many pull requests; only one that names the item, or that ADO links, is the item's. */
function belongsTo(item: DispatchItem, pr: ThreadPullRequest): boolean {
  if (item.linkedPullRequests.includes(pr.number)) return true;
  return new RegExp(`(\\b|AB#?)${item.id}\\b`).test(`${pr.title} ${pr.headBranch ?? ''}`);
}

function sameUrl(a: string, b: string): boolean {
  return a !== '' && a.toLowerCase() === b.toLowerCase();
}

function relevantPullRequest(
  item: DispatchItem,
  threads: readonly AgentThread[],
  known: readonly KnownPullRequest[],
): UnitPullRequest | null {
  const candidates = new Map<string, UnitPullRequest>();
  const add = (pr: UnitPullRequest) => candidates.set(pr.url.toLowerCase() || `#${pr.number}`, pr);

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
    });
  }

  return (
    [...candidates.values()].sort(
      (a, b) => PULL_REQUEST_RANK[a.state] - PULL_REQUEST_RANK[b.state] || b.number - a.number,
    )[0] ?? null
  );
}

function suggest(
  item: DispatchItem,
  threads: readonly AgentThread[],
  pr: UnitPullRequest | null,
  now: Date,
): Suggestion | null {
  const names = item.states.map((s) => s.name);
  const position = (name: string) => names.indexOf(name);
  const isAhead = (name: string) => position(name) !== -1 && position(item.state) < position(name);
  const inCategory = (category: string) => item.states.filter((s) => s.category === category);

  if (pr?.state === 'merged') {
    const resolved = inCategory('Resolved');
    const to =
      MERGED_NAMES.find((name) => names.includes(name)) ??
      resolved[resolved.length - 1]?.name ??
      inCategory('Completed')[0]?.name;
    if (to && isAhead(to)) {
      return {
        id: `${item.id}:merged:${pr.number}`,
        to,
        reason: `PR ${pr.number} is merged. ADO still says ${item.state}.`,
      };
    }
  }

  if (pr?.state === 'open' && !pr.isDraft) {
    const to = names.find((name) => REVIEW_NAME.test(name));
    if (to && isAhead(to)) {
      return {
        id: `${item.id}:open:${pr.number}`,
        to,
        reason: `PR ${pr.number} is open. ADO still says ${item.state}.`,
      };
    }
  }

  if (item.stateCategory === 'Proposed' && threads.length > 0) {
    const to =
      IN_PROGRESS_NAMES.find((name) => names.includes(name)) ?? inCategory('InProgress')[0]?.name;
    const started = threads[threads.length - 1]!.createdAt.slice(0, 10);
    if (to) {
      return {
        id: `${item.id}:started`,
        to,
        reason: `An agent started on this ${started}. ADO still says ${item.state}.`,
      };
    }
  }

  const expectsWork =
    item.stateCategory === 'InProgress' &&
    !HOLD_STATES.has(item.state) &&
    !HUMAN_NEEDED_STATES.has(item.state) &&
    pr?.state !== 'open';
  if (expectsWork) {
    const lastTouch = threads[0]?.lastActivityAt;
    if (!lastTouch) {
      return {
        id: `${item.id}:untouched:${item.state}`,
        to: null,
        reason: `${item.state}, but no agent has worked on it.`,
      };
    }
    if ((now.getTime() - Date.parse(lastTouch)) / MS_PER_DAY > STALE_AFTER_DAYS) {
      const since = lastTouch.slice(0, 10);
      return {
        id: `${item.id}:stale:${since}`,
        to: null,
        reason: `${item.state}, but no agent activity since ${since}.`,
      };
    }
  }

  return null;
}

function waitingFor(item: DispatchItem, threads: readonly AgentThread[]): string | null {
  if (HUMAN_NEEDED_STATES.has(item.state)) return `ADO says ${item.state}`;
  const thread = threads.find(needsYou);
  return thread ? `${THREAD_STATUS_LABEL[thread.status]} in ${thread.slot}` : null;
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

  const items = input.items.map((item): ItemOverview => {
    const itemThreads = links.threadsByItem.get(item.id) ?? [];
    const pullRequest = relevantPullRequest(item, itemThreads, input.pullRequests);
    let suggestion = suggest(item, itemThreads, pullRequest, now);
    if (suggestion && input.hiddenSuggestions.has(suggestion.id)) suggestion = null;
    const waiting = waitingFor(item, itemThreads);

    // Once an agent works on a queued item, the queue has done its job.
    const pickedUp = input.queued.has(item.id) && itemThreads.some((t) => t.open);
    if (pickedUp) dequeue.push(item.id);
    const queued = input.queued.has(item.id) && !pickedUp;

    return {
      item,
      bay: bayOf(item, itemThreads, waiting, suggestion, queued),
      waitingFor: waiting,
      suggestion,
      pullRequest,
      threads: itemThreads.slice(0, MAX_THREADS_PER_ITEM),
      queued,
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
