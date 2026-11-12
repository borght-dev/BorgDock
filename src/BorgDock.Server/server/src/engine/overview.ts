import type { Bay, ItemOverview, Overview, PullRequest, SourceStatus, Suggestion, ThreadSummary, Worktree } from '../../../shared/src/api.ts';
import { summaryOf, type AdoItem } from '../ado/client.ts';
import type { T3Project, T3PullRequest, T3Thread } from '../t3/source.ts';
import { guessItem, linkThreads } from './link.ts';

export type EngineInput = {
  items: AdoItem[];
  threads: T3Thread[];
  projects: T3Project[];
  queue: Map<number, string>;
  dismissed: Set<string>;
  manualLinks: Map<string, number | null>;
  worktreePattern: RegExp;
  threadLink: (threadId: string) => { link: string; appLink: string };
  sources: Overview['sources'];
  now?: Date;
};

const STALE_AFTER_DAYS = 5;
const IN_PROGRESS_NAMES = ['Development In Progress', 'In Progress', 'Active', 'Committed'];
const HOLD_STATES = new Set(['On Hold', 'Awaiting Answers', 'Blocked']);
const HUMAN_NEEDED_STATES = new Set(['Needs Human']);
const NEEDS_YOU = new Set(['question', 'plan', 'approval', 'your-turn', 'failed']);

const WAITING_LABELS: Record<string, string> = {
  question: 'Agent asks',
  plan: 'Plan to review',
  approval: 'Needs approval',
  'your-turn': 'Your turn',
  failed: 'Agent failed',
};

export function threadSummary(t: T3Thread, links: (id: string) => { link: string; appLink: string }): ThreadSummary {
  return {
    id: t.id,
    environmentId: t.environmentId,
    environmentLabel: t.environmentLabel,
    available: t.available,
    title: t.title,
    worktree: t.worktree,
    branch: t.branch,
    status: t.status,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    model: t.model,
    questionRequestId: t.questionRequestId,
    questions: t.questions,
    lastAgentMessage: t.open ? t.lastAgentMessage : null,
    ...links(t.id),
  };
}

// A thread can touch many PRs; only PRs that name the item, or that ADO links, say anything about its state.
function belongsTo(item: AdoItem, pr: T3PullRequest): boolean {
  return item.linkedPullRequests.includes(pr.number) || new RegExp(`(\\b|AB#?)${item.id}\\b`).test(`${pr.title} ${pr.headBranch ?? ''}`);
}

function relevantPullRequest(item: AdoItem, threads: T3Thread[]): PullRequest | null {
  const byNumber = new Map<number, T3PullRequest>();
  for (const pr of threads.flatMap((t) => t.pullRequests)) if (belongsTo(item, pr)) byNumber.set(pr.number, pr);
  const rank = { open: 0, merged: 1, unknown: 2, closed: 3 };
  const pr = [...byNumber.values()].sort((a, b) => rank[a.state] - rank[b.state] || b.number - a.number)[0];
  return pr ? { number: pr.number, url: pr.url, branch: pr.headBranch, state: pr.state, title: pr.title, isDraft: pr.isDraft, checks: pr.checks } : null;
}

function suggest(item: AdoItem, threads: T3Thread[], pr: PullRequest | null, now: Date): Suggestion | null {
  const names = item.states.map((s) => s.name);
  const position = (name: string) => names.indexOf(name);
  const isAhead = (name: string) => position(name) !== -1 && position(item.state) < position(name);
  const firstIn = (category: string) => item.states.find((s) => s.category === category)?.name ?? null;

  if (pr?.state === 'merged') {
    const to = names.includes('Ready For QA') ? 'Ready For QA' : firstIn('Completed');
    if (to && isAhead(to)) return { id: `${item.id}:merged:${pr.number}`, to, reason: `PR ${pr.number} is merged. ADO still says ${item.state}.` };
  }
  if (pr?.state === 'open' && !pr.isDraft && isAhead('Code Review')) {
    return { id: `${item.id}:open:${pr.number}`, to: 'Code Review', reason: `PR ${pr.number} is open. ADO still says ${item.state}.` };
  }
  if (item.stateCategory === 'Proposed' && threads.length > 0) {
    const to = IN_PROGRESS_NAMES.find((n) => names.includes(n)) ?? firstIn('InProgress');
    const started = threads[threads.length - 1].createdAt.slice(0, 10);
    if (to) return { id: `${item.id}:started`, to, reason: `An agent started on this ${started}. ADO still says ${item.state}.` };
  }
  if (item.stateCategory === 'InProgress' && !HOLD_STATES.has(item.state) && !HUMAN_NEEDED_STATES.has(item.state) && pr?.state !== 'open') {
    const lastTouch = threads[0]?.lastActivityAt;
    if (!lastTouch) return { id: `${item.id}:untouched:${item.state}`, to: null, reason: `${item.state}, but no agent has worked on it.` };
    if ((now.getTime() - Date.parse(lastTouch)) / 86_400_000 > STALE_AFTER_DAYS) {
      return { id: `${item.id}:stale:${lastTouch.slice(0, 10)}`, to: null, reason: `${item.state}, but no agent activity since ${lastTouch.slice(0, 10)}.` };
    }
  }
  return null;
}

function waitingFor(item: AdoItem, threads: T3Thread[]): string | null {
  if (HUMAN_NEEDED_STATES.has(item.state)) return `ADO says ${item.state}`;
  const t = threads.find((x) => x.open && NEEDS_YOU.has(x.status));
  return t ? `${WAITING_LABELS[t.status]} in ${t.worktree}` : null;
}

function bayOf(item: AdoItem, threads: T3Thread[], waiting: string | null, suggestion: Suggestion | null, queued: boolean): Bay {
  if (waiting) return 'waiting';
  if (suggestion) return 'drift';
  if (threads.some((t) => t.open && t.status === 'running')) return 'working';
  if (queued) return 'next';
  if (item.stateCategory === 'Resolved') return 'handed';
  return threads.length ? 'paused' : 'idle';
}

const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function buildOverview(input: EngineInput): { overview: Overview; dequeue: number[] } {
  const now = input.now ?? new Date();
  const links = linkThreads(input.items, input.threads, input.manualLinks);
  const link = input.threadLink;
  const dequeue: number[] = [];

  const items = input.items.map((item): ItemOverview => {
    const threads = links.threadsByItem.get(item.id) ?? [];
    const pullRequest = relevantPullRequest(item, threads);
    let suggestion = suggest(item, threads, pullRequest, now);
    if (suggestion && input.dismissed.has(suggestion.id)) suggestion = null;
    const waiting = waitingFor(item, threads);
    const queuedAt = input.queue.get(item.id) ?? null;
    // Once an agent is working on a queued item, the queue has done its job.
    if (queuedAt && threads.some((t) => t.open)) dequeue.push(item.id);
    const queued = Boolean(queuedAt) && !dequeue.includes(item.id);
    return {
      item: summaryOf(item),
      bay: bayOf(item, threads, waiting, suggestion, queued),
      waitingFor: waiting,
      suggestion,
      pullRequest,
      threads: threads.slice(0, 10).map((t) => threadSummary(t, link)),
      queuedAt: queued ? queuedAt : null,
    };
  });

  const myItemIds = new Set(input.items.map((i) => i.id));
  const worktrees: Worktree[] = input.projects
    .filter((p) => input.worktreePattern.test(p.title))
    .sort((a, b) => naturalOrder(a.title, b.title))
    .map((p) => {
      const open = input.threads.filter((t) => t.open && t.projectId === p.id);
      const mine = open.find((t) => myItemIds.has(links.itemOfThread.get(t.id) ?? -1));
      const mineItem = mine ? links.itemOfThread.get(mine.id)! : null;
      return {
        id: p.id,
        environmentId: p.environmentId,
        environmentLabel: p.environmentLabel,
        available: p.available,
        name: p.title,
        state: !open.length ? 'free' : mine ? 'mine' : 'busy',
        itemId: mineItem,
        running: open.some((t) => t.status === 'running'),
        needsYou: Boolean(mine && NEEDS_YOU.has(mine.status)),
      };
    });

  const unlinkedThreads = links.unlinked
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .map((t) => ({ ...threadSummary(t, link), guessItemId: guessItem(t, input.items) }));

  return {
    overview: { generatedAt: now.toISOString(), items, unlinkedThreads, worktrees, sources: input.sources },
    dequeue,
  };
}
