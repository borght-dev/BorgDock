import { clip } from './item-text';
import {
  type AgentThread,
  type DispatchItem,
  type Evidence,
  type LatestMessage,
  NEEDS_YOU,
  THREAD_STATUS_LABEL,
  type UnitPullRequest,
  type Verdict,
} from './types';

/** What a verdict is drawn from. `threads` and `pullRequests` come newest and open first. */
export interface ItemFacts {
  item: DispatchItem;
  threads: readonly AgentThread[];
  pullRequests: readonly UnitPullRequest[];
  now: Date;
  /** The state the evidence asks for, unless you chose to keep the current one (`driftOf`). */
  drift?: Drift | null;
}

/** The state an item's evidence asks for, when ADO says something else. */
export interface Drift {
  to: string;
  reason: string;
  /** What the drift rests on; a new piece of evidence makes a new drift. */
  evidence: string;
}

const MS_PER_DAY = 86_400_000;
const QUIET_AFTER_DAYS = 5;
const DUE_SOON_DAYS = 7;
const AGENT_MESSAGE_LIMIT = 480;
const REVIEW_NAME = /\breview\b/i;
const NEEDS_HUMAN = 'Needs Human';
const TESTING_FAILED = 'Testing Failed';
const HOLD_STATES = new Set(['On Hold', 'Awaiting Answers', 'Blocked']);
const CODE_REVIEW = /^code review$/i;
const PLAN = /\bplan\b/i;
const QA_STATES = ['Ready For QA', 'Resolved'];
const IN_PROGRESS_STATES = ['Development In Progress', 'In Progress', 'Active', 'Committed'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utcDay(time: number): number {
  return Math.floor(time / MS_PER_DAY);
}

/** Calendar days from `iso` to `now`: yesterday is 1, whatever the hour. */
function daysSince(iso: string, now: Date): number {
  return utcDay(now.getTime()) - utcDay(Date.parse(iso));
}

function days(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

/** `6 Nov`, in UTC like the dates ADO stores. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function ago(iso: string, now: Date): string {
  const count = daysSince(iso, now);
  if (count <= 0) return 'today';
  if (count === 1) return 'yesterday';
  return `${count} days ago`;
}

type CheckState = 'failed' | 'pending' | 'passed' | null;

function checkState(pr: UnitPullRequest): CheckState {
  if (!pr.checks || pr.checks.total === 0) return null;
  if (pr.checks.failed > 0) return 'failed';
  if (pr.checks.pending > 0) return 'pending';
  return 'passed';
}

function currentThread(threads: readonly AgentThread[]): AgentThread | null {
  return threads.find((thread) => thread.open) ?? null;
}

/** The pull requests that are the item's own, not shared with other items. */
function own(pullRequests: readonly UnitPullRequest[]): UnitPullRequest[] {
  return pullRequests.filter((pr) => !pr.shared);
}

function openPullRequest(pullRequests: readonly UnitPullRequest[]): UnitPullRequest | null {
  return own(pullRequests).find((pr) => pr.state === 'open') ?? null;
}

function mergedPullRequest(pullRequests: readonly UnitPullRequest[]): UnitPullRequest | null {
  return own(pullRequests).find((pr) => pr.state === 'merged') ?? null;
}

/** Where an open pull request puts an item: Code Review, never Plan Review. */
function reviewState(names: readonly string[]): string | undefined {
  return (
    names.find((name) => CODE_REVIEW.test(name)) ??
    names.find((name) => REVIEW_NAME.test(name) && !PLAN.test(name))
  );
}

/** Where a merged pull request puts an item: QA, else the end of the workflow. */
function qaState(item: DispatchItem): string | undefined {
  const names = item.states.map((s) => s.name);
  const resolved = item.states.filter(
    (s) => s.category === 'Resolved' && !REVIEW_NAME.test(s.name),
  );
  return (
    QA_STATES.find((name) => names.includes(name)) ??
    resolved[0]?.name ??
    item.states.find((s) => s.category === 'Completed')?.name
  );
}

function startedState(item: DispatchItem): string | undefined {
  const names = item.states.map((s) => s.name);
  return (
    IN_PROGRESS_STATES.find((name) => names.includes(name)) ??
    item.states.find((s) => s.category === 'InProgress')?.name
  );
}

/**
 * The state the evidence says an item belongs in, when ADO says something
 * else: merged means QA, an open pull request means Code Review, an agent at
 * work means In Progress. Nothing for a state a person or a hold put it in.
 */
export function driftOf({ item, threads, pullRequests }: ItemFacts): Drift | null {
  if (item.state === NEEDS_HUMAN || item.state === TESTING_FAILED) return null;
  if (HOLD_STATES.has(item.state)) return null;
  if (item.stateCategory === 'Completed' || item.stateCategory === 'Removed') return null;
  const thread = currentThread(threads);

  const names = item.states.map((s) => s.name);
  const ahead = (to: string | undefined): to is string =>
    to !== undefined && names.indexOf(item.state) < names.indexOf(to);
  const still = `ADO still says ${item.state}.`;

  const open = openPullRequest(pullRequests);
  const merged = mergedPullRequest(pullRequests);
  if (!open && merged) {
    const to = qaState(item);
    if (ahead(to)) {
      return {
        to,
        reason: `PR ${merged.number} is merged. ${still}`,
        evidence: `merged:${merged.number}`,
      };
    }
  }
  if (open && !open.isDraft && item.stateCategory !== 'Resolved') {
    const to = reviewState(names);
    if (ahead(to)) {
      return { to, reason: `PR ${open.number} is open. ${still}`, evidence: `open:${open.number}` };
    }
  }
  if (item.stateCategory === 'Proposed' && thread) {
    const to = startedState(item);
    if (to) {
      return {
        to,
        reason: `An agent works on it in ${thread.slot}. ${still}`,
        evidence: 'started',
      };
    }
  }
  return null;
}

/** The last sign of life: the item changing in ADO, or its agent doing something. */
function lastActivity(item: DispatchItem, threads: readonly AgentThread[]): string {
  const touch = threads[0]?.lastActivityAt;
  return touch && touch > item.changedAt ? touch : item.changedAt;
}

function reviewVerdict(item: DispatchItem, pullRequests: readonly UnitPullRequest[]): Verdict {
  if (!REVIEW_NAME.test(item.state)) return { label: 'With QA', tone: 'mute' };
  const open = openPullRequest(pullRequests);
  if (open) {
    const checks = checkState(open);
    if (checks === 'failed') return { label: 'CI red', tone: 'bad' };
    if (open.approved && checks !== 'pending') return { label: 'Ready to merge', tone: 'ok' };
    if (checks === 'pending') return { label: 'Checks running', tone: 'run' };
    return { label: 'In review', tone: 'mute' };
  }
  if (mergedPullRequest(pullRequests)) return { label: 'Merged', tone: 'mute' };
  return { label: 'No open PR', tone: 'warn' };
}

function inProgressVerdict({ item, threads, pullRequests, now }: ItemFacts): Verdict {
  const thread = currentThread(threads);
  if (item.state === TESTING_FAILED) return { label: 'Bounced back', tone: 'bad' };
  if (HOLD_STATES.has(item.state)) return { label: item.state, tone: 'mute' };
  const open = openPullRequest(pullRequests);
  if (open)
    return open.isDraft ? { label: 'Draft PR', tone: 'mute' } : { label: 'PR open', tone: 'warn' };
  const hasPullRequests = pullRequests.length > 0 || item.linkedPullRequests.length > 0;
  if (!thread && hasPullRequests) return { label: 'Next step?', tone: 'warn' };
  if (!thread && !item.notes && !item.lastComment) return { label: 'Nobody on it', tone: 'warn' };
  const quiet = daysSince(lastActivity(item, threads), now);
  if (quiet > QUIET_AFTER_DAYS) return { label: `Quiet · ${days(quiet)}`, tone: 'warn' };
  return { label: 'In progress', tone: 'mute' };
}

/** The verdict of an item whose state the evidence contradicts (`driftOf`). */
export const OUT_OF_SYNC = 'Out of sync';

/** What an item needs, in a few words. The rules are in the Dispatch spec, in this order. */
export function verdictOf(facts: ItemFacts): Verdict {
  const { item, threads, pullRequests, now } = facts;
  const thread = currentThread(threads);
  if (thread && NEEDS_YOU.includes(thread.status)) {
    return { label: THREAD_STATUS_LABEL[thread.status], tone: 'bad' };
  }
  if (item.state === NEEDS_HUMAN) {
    if (item.lastComment?.byMe) return { label: 'You answered', tone: 'mute' };
    const waited = daysSince(item.lastComment?.at ?? item.changedAt, now);
    return {
      label: waited >= 1 ? `Waiting on you · ${days(waited)}` : 'Waiting on you',
      tone: 'bad',
    };
  }
  const resolved = item.stateCategory === 'Resolved';
  if (item.dueDate && !resolved) {
    const late = daysSince(item.dueDate, now);
    if (late >= 1) return { label: `Overdue · ${days(late)}`, tone: 'bad' };
  }
  if (thread?.status === 'running') return { label: 'Agent on it', tone: 'run' };
  if (facts.drift) return { label: OUT_OF_SYNC, tone: 'warn' };
  if (resolved) return reviewVerdict(item, pullRequests);
  if (item.stateCategory === 'InProgress') return inProgressVerdict(facts);
  if (thread) return { label: 'Agent started', tone: 'run' };
  return { label: 'Not started', tone: 'mute' };
}

function pullRequestEvidence(pr: UnitPullRequest): Evidence {
  const checks = checkState(pr);
  const parts = [`#${pr.number}`];
  if (pr.isDraft) parts.push('draft');
  else if (pr.approved) parts.push('approved');
  if (checks === 'failed') parts.push('checks failing');
  else if (checks === 'pending') parts.push('checks running');
  else if (checks === 'passed') parts.push('green');
  const tone =
    checks === 'failed'
      ? 'bad'
      : checks === 'pending'
        ? 'run'
        : pr.approved && checks === 'passed'
          ? 'ok'
          : null;
  return { label: parts.join(' · '), tone };
}

/** The facts behind the verdict, as chips: pull requests, agent, due date, priority. */
export function evidenceOf({ item, threads, pullRequests, now }: ItemFacts): Evidence[] {
  const evidence: Evidence[] = [];
  const inProgress = item.stateCategory === 'InProgress';
  const open = openPullRequest(pullRequests);
  if (open) evidence.push(pullRequestEvidence(open));
  const merged = mergedPullRequest(pullRequests);
  if (merged) {
    const when = merged.mergedAt ? ` ${ago(merged.mergedAt, now)}` : '';
    evidence.push({ label: `#${merged.number} merged${when}`, tone: open ? null : 'ok' });
  }
  if (!open && !merged) {
    const linked = Math.max(pullRequests.length, item.linkedPullRequests.length);
    if (linked > 0) {
      evidence.push({ label: linked === 1 ? '1 linked PR' : `${linked} linked PRs`, tone: null });
    } else if (inProgress) {
      evidence.push({ label: 'no PR', tone: null });
    }
  }

  const thread = currentThread(threads);
  if (thread) {
    const running = thread.status === 'running';
    evidence.push({
      label: `${running ? 'agent running' : 'agent'} · ${thread.slot}`,
      tone: running ? 'run' : null,
    });
  } else if (inProgress) {
    evidence.push({ label: 'no agent', tone: null });
  }

  if (item.dueDate && item.stateCategory !== 'Resolved') {
    const left = -daysSince(item.dueDate, now);
    const tone = left < 0 ? 'bad' : left <= DUE_SOON_DAYS ? 'warn' : null;
    evidence.push({ label: `due ${shortDate(item.dueDate)}`, tone });
  }
  if (item.priority === 1) evidence.push({ label: 'P1', tone: 'warn' });
  return evidence;
}

/** A date-only time counts as the start of that day, so a comment the same day is newer. */
function sortKey(message: LatestMessage): string {
  return message.at ?? '';
}

/**
 * The newest thing said about the item: its newest comment, the newest block
 * of its Developer Notes, or the last message of the agent working on it.
 */
export function latestMessage(
  item: DispatchItem,
  threads: readonly AgentThread[],
): LatestMessage | null {
  const said: LatestMessage[] = [];
  if (item.lastComment) {
    const { author, at, text } = item.lastComment;
    said.push({ source: 'comment', author, at, text });
  }
  if (item.notes) {
    said.push({
      source: 'notes',
      author: 'Developer Notes',
      at: item.notes.date,
      text: item.notes.text,
    });
  }
  const thread = threads.find((t) => t.open && t.lastAgentMessage);
  if (thread?.lastAgentMessage) {
    said.push({
      source: 'agent',
      author: `Agent · ${thread.slot}`,
      at: thread.lastActivityAt,
      text: clip(thread.lastAgentMessage.replace(/\s+/g, ' ').trim(), AGENT_MESSAGE_LIMIT),
    });
  }
  return said.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))[0] ?? null;
}
