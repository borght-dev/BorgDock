import type { Evidence, ThreadStatus, Tone, Verdict } from '../../../shared/src/api.ts';
import type { WorkflowState } from '../ado/client.ts';

// Ported from the desktop's src/services/dispatch/verdict.ts (BorgDock.Tauri). Same rules, same order, same words;
// change one there and here together. Spec: docs/superpowers/specs/2026-10-13-dispatch-state-walk.md in that repo.

export type ItemNote = { text: string; date: string | null };
export type ItemComment = { author: string; at: string; text: string; byMe: boolean };

export type WalkItem = {
  id: number;
  state: string;
  stateCategory: WorkflowState['category'];
  states: WorkflowState[];
  notes: ItemNote | null;
  lastComment: ItemComment | null;
  dueDate: string | null;
  priority: number | null;
  linkedPullRequests: number[];
  changedAt: string;
};

export type WalkThread = { open: boolean; status: ThreadStatus; place: string; lastActivityAt: string; lastAgentMessage: string | null };

export type WalkPullRequest = {
  number: number;
  state: 'open' | 'merged' | 'closed' | 'unknown';
  isDraft: boolean;
  checks: { passed: number; failed: number; pending: number; total: number } | null;
  approved: boolean;
  mergedAt: string | null;
  /** Linked to several of my items without naming this one: it says nothing about this item's own state. */
  shared: boolean;
};

export type ItemFacts = {
  item: WalkItem;
  /** Newest first. */
  threads: readonly WalkThread[];
  /** Open first. */
  pullRequests: readonly WalkPullRequest[];
  now: Date;
  drift?: Drift | null;
};

export type Drift = { to: string; reason: string; evidence: string };
export type WalkMessage = { source: 'comment' | 'notes' | 'agent'; author: string; at: string | null; text: string };

export const NEEDS_YOU: readonly ThreadStatus[] = ['question', 'plan', 'approval', 'your-turn', 'failed'];
export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  question: 'Agent asks',
  plan: 'Plan to review',
  approval: 'Needs approval',
  'your-turn': 'Your turn',
  failed: 'Agent failed',
  running: 'Running',
  settled: 'Settled',
};

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

/** `text` cut to at most `limit` characters, at a word, with an ellipsis when cut. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const utcDay = (time: number) => Math.floor(time / MS_PER_DAY);
/** Calendar days from `iso` to `now`: yesterday is 1, whatever the hour. */
const daysSince = (iso: string, now: Date) => utcDay(now.getTime()) - utcDay(Date.parse(iso));
const days = (count: number) => (count === 1 ? '1 day' : `${count} days`);
const shortDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};
function ago(iso: string, now: Date): string {
  const count = daysSince(iso, now);
  if (count <= 0) return 'today';
  if (count === 1) return 'yesterday';
  return `${count} days ago`;
}

type CheckState = 'failed' | 'pending' | 'passed' | null;
function checkState(pr: WalkPullRequest): CheckState {
  if (!pr.checks || pr.checks.total === 0) return null;
  if (pr.checks.failed > 0) return 'failed';
  if (pr.checks.pending > 0) return 'pending';
  return 'passed';
}

const currentThread = (threads: readonly WalkThread[]) => threads.find((t) => t.open) ?? null;
const own = (prs: readonly WalkPullRequest[]) => prs.filter((pr) => !pr.shared);
const openPullRequest = (prs: readonly WalkPullRequest[]) => own(prs).find((pr) => pr.state === 'open') ?? null;
const mergedPullRequest = (prs: readonly WalkPullRequest[]) => own(prs).find((pr) => pr.state === 'merged') ?? null;

/** Where an open pull request puts an item: Code Review, never Plan Review. */
function reviewState(names: readonly string[]): string | undefined {
  return names.find((name) => CODE_REVIEW.test(name)) ?? names.find((name) => REVIEW_NAME.test(name) && !PLAN.test(name));
}

function qaState(item: WalkItem): string | undefined {
  const names = item.states.map((s) => s.name);
  const resolved = item.states.filter((s) => s.category === 'Resolved' && !REVIEW_NAME.test(s.name));
  return QA_STATES.find((name) => names.includes(name)) ?? resolved[0]?.name ?? item.states.find((s) => s.category === 'Completed')?.name;
}

function startedState(item: WalkItem): string | undefined {
  const names = item.states.map((s) => s.name);
  return IN_PROGRESS_STATES.find((name) => names.includes(name)) ?? item.states.find((s) => s.category === 'InProgress')?.name;
}

/** The state the evidence says an item belongs in, when ADO says something else. */
export function driftOf({ item, threads, pullRequests }: ItemFacts): Drift | null {
  if (item.state === NEEDS_HUMAN || item.state === TESTING_FAILED) return null;
  if (HOLD_STATES.has(item.state)) return null;
  if (item.stateCategory === 'Completed' || item.stateCategory === 'Removed') return null;
  const thread = currentThread(threads);
  const names = item.states.map((s) => s.name);
  const ahead = (to: string | undefined): to is string => to !== undefined && names.indexOf(item.state) < names.indexOf(to);
  const still = `ADO still says ${item.state}.`;
  const open = openPullRequest(pullRequests);
  const merged = mergedPullRequest(pullRequests);
  if (!open && merged) {
    const to = qaState(item);
    if (ahead(to)) return { to, reason: `PR ${merged.number} is merged. ${still}`, evidence: `merged:${merged.number}` };
  }
  if (open && !open.isDraft && item.stateCategory !== 'Resolved') {
    const to = reviewState(names);
    if (ahead(to)) return { to, reason: `PR ${open.number} is open. ${still}`, evidence: `open:${open.number}` };
  }
  if (item.stateCategory === 'Proposed' && thread) {
    const to = startedState(item);
    if (to) return { to, reason: `An agent works on it in ${thread.place}. ${still}`, evidence: 'started' };
  }
  return null;
}

function lastActivity(item: WalkItem, threads: readonly WalkThread[]): string {
  const touch = threads[0]?.lastActivityAt;
  return touch && touch > item.changedAt ? touch : item.changedAt;
}

function reviewVerdict(item: WalkItem, pullRequests: readonly WalkPullRequest[]): Verdict {
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
  if (open) return open.isDraft ? { label: 'Draft PR', tone: 'mute' } : { label: 'PR open', tone: 'warn' };
  const hasPullRequests = pullRequests.length > 0 || item.linkedPullRequests.length > 0;
  if (!thread && hasPullRequests) return { label: 'Next step?', tone: 'warn' };
  if (!thread && !item.notes && !item.lastComment) return { label: 'Nobody on it', tone: 'warn' };
  const quiet = daysSince(lastActivity(item, threads), now);
  if (quiet > QUIET_AFTER_DAYS) return { label: `Quiet · ${days(quiet)}`, tone: 'warn' };
  return { label: 'In progress', tone: 'mute' };
}

export const OUT_OF_SYNC = 'Out of sync';

/** What an item needs, in a few words; first match wins. */
export function verdictOf(facts: ItemFacts): Verdict {
  const { item, threads, pullRequests, now } = facts;
  const thread = currentThread(threads);
  if (thread && NEEDS_YOU.includes(thread.status)) return { label: THREAD_STATUS_LABEL[thread.status], tone: 'bad' };
  if (item.state === NEEDS_HUMAN) {
    if (item.lastComment?.byMe) return { label: 'You answered', tone: 'mute' };
    const waited = daysSince(item.lastComment?.at ?? item.changedAt, now);
    return { label: waited >= 1 ? `Waiting on you · ${days(waited)}` : 'Waiting on you', tone: 'bad' };
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

function pullRequestEvidence(pr: WalkPullRequest): Evidence {
  const checks = checkState(pr);
  const parts = [`#${pr.number}`];
  if (pr.isDraft) parts.push('draft');
  else if (pr.approved) parts.push('approved');
  if (checks === 'failed') parts.push('checks failing');
  else if (checks === 'pending') parts.push('checks running');
  else if (checks === 'passed') parts.push('green');
  const tone: Tone | null = checks === 'failed' ? 'bad' : checks === 'pending' ? 'run' : pr.approved && checks === 'passed' ? 'ok' : null;
  return { label: parts.join(' · '), tone, kind: 'pr' };
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
    evidence.push({ label: `#${merged.number} merged${when}`, tone: open ? null : 'ok', kind: 'merged' });
  }
  if (!open && !merged) {
    const linked = Math.max(pullRequests.length, item.linkedPullRequests.length);
    if (linked > 0) evidence.push({ label: linked === 1 ? '1 linked PR' : `${linked} linked PRs`, tone: null, kind: 'pr' });
    else if (inProgress) evidence.push({ label: 'no PR', tone: null, kind: 'pr' });
  }
  const thread = currentThread(threads);
  if (thread) {
    const running = thread.status === 'running';
    evidence.push({ label: `${running ? 'agent running' : 'agent'} · ${thread.place}`, tone: running ? 'run' : null, kind: 'agent' });
  } else if (inProgress) {
    evidence.push({ label: 'no agent', tone: null, kind: 'agent' });
  }
  if (item.dueDate && item.stateCategory !== 'Resolved') {
    const left = -daysSince(item.dueDate, now);
    const tone: Tone | null = left < 0 ? 'bad' : left <= DUE_SOON_DAYS ? 'warn' : null;
    evidence.push({ label: `due ${shortDate(item.dueDate)}`, tone, kind: 'due' });
  }
  if (item.priority === 1) evidence.push({ label: 'P1', tone: 'warn', kind: 'priority' });
  return evidence;
}

/** The newest of the item's newest comment, the top block of its Developer Notes and its agent's last message. */
export function latestMessage(item: WalkItem, threads: readonly WalkThread[]): WalkMessage | null {
  const said: WalkMessage[] = [];
  if (item.lastComment) said.push({ source: 'comment', author: item.lastComment.author, at: item.lastComment.at, text: item.lastComment.text });
  if (item.notes) said.push({ source: 'notes', author: 'Developer Notes', at: item.notes.date, text: item.notes.text });
  const thread = threads.find((t) => t.open && t.lastAgentMessage);
  if (thread?.lastAgentMessage) {
    said.push({ source: 'agent', author: `Agent · ${thread.place}`, at: thread.lastActivityAt, text: clip(thread.lastAgentMessage.replace(/\s+/g, ' ').trim(), AGENT_MESSAGE_LIMIT) });
  }
  // A date-only time counts as the start of that day, so a comment the same day is newer.
  return said.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] ?? null;
}

/* ---------- reading ADO text ---------- */

const BLOCK_EDGE = /<\s*\/?\s*(br|p|div|li|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntity(name: string): string | undefined {
  if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
  if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
  return NAMED_ENTITIES[name.toLowerCase()];
}

export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_EDGE, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => decodeEntity(name) ?? whole)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const NOTE_LIMIT = 320;
const COMMENT_LIMIT = 480;
const DATE = /\b(20\d{2}-\d{2}-\d{2})\b/;
const NEXT_BLOCK = /\n(?=(?:Status update|Update|Status) \(20\d{2}-\d{2}-\d{2}\)|20\d{2}-\d{2}-\d{2} [—-])/;
const DATED_HEADING = /^(?:Status update|Update|Status) \(20\d{2}-\d{2}-\d{2}\)\s*[-—:]?\s*/;

/** The newest block of Developer Notes: new entries are added on top. */
export function newestNote(html: unknown): ItemNote | null {
  if (typeof html !== 'string') return null;
  const text = htmlToText(html);
  if (!text) return null;
  const block = text.split(NEXT_BLOCK)[0].replace(/\n/g, ' ');
  const date = DATE.exec(block.slice(0, 120))?.[1] ?? null;
  return { text: clip(block.replace(DATED_HEADING, ''), NOTE_LIMIT), date };
}

/** `Vera · plan — …`: an agent signs what it posts from someone else's account. */
const SIGNED = /^([\p{L}][\p{L}.]*) · ([\p{L}-]+) [—-] /u;

/** Who signed a comment (`Vera · plan`) and the signature as written, or null when nobody did. */
export function signatureOf(text: string): { author: string; prefix: string } | null {
  const signed = SIGNED.exec(text);
  return signed ? { author: `${signed[1]} · ${signed[2]}`, prefix: signed[0] } : null;
}

export function toItemComment(comment: { text: string; createdDate: string; createdBy: { displayName: string } }, me: string | null): ItemComment {
  const text = htmlToText(comment.text).replace(/\n/g, ' ');
  const signed = signatureOf(text);
  const poster = comment.createdBy.displayName;
  return {
    author: signed ? signed.author : poster,
    at: comment.createdDate,
    text: clip(signed ? text.slice(signed.prefix.length) : text, COMMENT_LIMIT),
    byMe: !signed && me !== null && poster === me,
  };
}
