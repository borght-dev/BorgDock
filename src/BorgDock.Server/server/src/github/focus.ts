// The Focus rules: which bucket a pull request sits in, the one-line reason, and how urgent it is.
// Ported from the desktop's src/services/focus-bucket.ts, pr-grouping.ts and priority-scoring.ts, so a pull
// request lands in the same bucket on the phone as in BorgDock.

import type { CheckState, CheckSummary, FocusBucket, Person, PrLabel, PrReason } from '../../../shared/src/api.ts';

export const FOCUS_BUCKETS: readonly FocusBucket[] = ['you', 'wait', 'ready', 'stale'];

export type CheckContext = {
  /** The check run's id (an Actions job id for workflow checks); 0 for commit statuses. */
  id: number;
  kind: 'check' | 'status';
  name: string;
  workflow: string | null;
  runId: number | null;
  state: CheckState;
  /** GitHub's raw conclusion, lower case; null while it runs. */
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
};

export type ReviewRecord = { login: string; state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'; submittedAt: string | null; commitSha: string | null };

/** A pull request as one GraphQL read gives it, before Focus places it. */
export type PrRecord = {
  account: string;
  nodeId: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  url: string;
  author: Person;
  isDraft: boolean;
  state: 'open' | 'merged' | 'closed';
  headRef: string;
  baseRef: string;
  headSha: string;
  defaultBranch: string | null;
  isCrossRepository: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: PrLabel[];
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  autoMerge: boolean;
  reviewDecision: 'approved' | 'changes_requested' | 'review_required' | null;
  requestedReviewers: string[];
  requestedTeams: string[];
  /** Each reviewer's latest review. */
  latestReviews: ReviewRecord[];
  checks: CheckContext[];
  /** The newest commit ids, oldest first (at most 20). */
  recentCommits: string[];
};

export type FocusContext = {
  /** The account that read the pull request: "you". */
  login: string;
  teams: readonly string[];
  now: number;
  staleAfterDays: number;
  snoozedUntil: (key: string) => number | null;
  /** When BorgDock first saw your review requested on this pull request. */
  reviewRequestedAt: (key: string) => string | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** GitHub bumps updatedAt for a review a moment after the review itself. */
const ACTIVITY_SLACK_MS = 60_000;

export const prKey = (pr: { owner: string; repo: string; number: number }) => `${pr.owner}/${pr.repo}#${pr.number}`;

/* ---------- checks ---------- */

export type OverallStatus = 'red' | 'yellow' | 'green' | 'gray';

export function overallStatus(checks: readonly CheckContext[]): OverallStatus {
  if (checks.length === 0) return 'gray';
  if (checks.some((c) => c.state === 'failure')) return 'red';
  if (checks.some((c) => c.state === 'pending')) return 'yellow';
  return 'green';
}

const SEGMENT_ORDER: Record<CheckState, number> = { failure: 0, pending: 1, success: 2, neutral: 3, skipped: 4 };

export function checkSummary(checks: readonly CheckContext[]): CheckSummary {
  const count = (state: CheckState) => checks.filter((c) => c.state === state).length;
  return {
    total: checks.length,
    passed: count('success'),
    failed: count('failure'),
    pending: count('pending'),
    skipped: count('skipped') + count('neutral'),
    segments: checks.map((c) => c.state).sort((a, b) => SEGMENT_ORDER[a] - SEGMENT_ORDER[b]).slice(0, 12),
  };
}

/* ---------- predicates (pr-grouping.ts) ---------- */

const lower = (s: string) => s.toLowerCase();

export const normalizeTeamSlug = (team: string) => {
  const trimmed = team.trim().replace(/^@/, '').toLowerCase();
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
};

function matchedTeams(requested: readonly string[], mine: readonly string[]): string[] {
  const set = new Set(mine.map(normalizeTeamSlug));
  return requested.map(normalizeTeamSlug).filter((t) => set.has(t));
}

/** The desktop's review status: the strongest of each reviewer's latest review. */
export function reviewStatus(pr: PrRecord): 'approved' | 'changesRequested' | 'commented' | 'pending' | 'none' {
  const states = pr.latestReviews.map((r) => r.state);
  if (states.includes('changes_requested')) return 'changesRequested';
  if (states.includes('approved')) return 'approved';
  if (states.includes('commented')) return 'commented';
  if (states.includes('pending')) return 'pending';
  return 'none';
}

export const isMine = (pr: PrRecord, login: string) => login !== '' && lower(pr.author.login) === lower(login);
export const isFailing = (pr: PrRecord) => overallStatus(pr.checks) === 'red';

export function isReady(pr: PrRecord): boolean {
  return overallStatus(pr.checks) === 'green' && !pr.isDraft && pr.mergeable !== 'conflicting' && reviewStatus(pr) === 'approved';
}

/** Still a pending requested reviewer, personally or through a team, and not already approved this head. */
export function isWaitingOnMe(pr: PrRecord, login: string, teams: readonly string[]): boolean {
  if (!login || isMine(pr, login)) return false;
  const me = lower(login);
  const approvedHead = pr.latestReviews.some((r) => lower(r.login) === me && r.state === 'approved' && (!r.commitSha || r.commitSha === pr.headSha));
  if (approvedHead) return false;
  if (pr.requestedReviewers.some((r) => lower(r) === me)) return true;
  return matchedTeams(pr.requestedTeams, teams).length > 0;
}

/** Review requested from you, or your PR with failing checks, changes requested or comments. */
export function isNeedsYou(pr: PrRecord, login: string, teams: readonly string[]): boolean {
  if (!login) return false;
  if (isWaitingOnMe(pr, login, teams)) return true;
  if (!isMine(pr, login)) return false;
  if (isFailing(pr)) return true;
  const status = reviewStatus(pr);
  return status === 'changesRequested' || status === 'commented';
}

/* ---------- buckets and reasons (focus-bucket.ts) ---------- */

export function isStale(pr: PrRecord, ctx: FocusContext): boolean {
  return pr.state === 'open' && ctx.now - Date.parse(pr.updatedAt) >= ctx.staleAfterDays * DAY;
}

export function isSnoozed(pr: PrRecord, ctx: FocusContext): boolean {
  const until = ctx.snoozedUntil(prKey(pr));
  return until !== null && until > ctx.now;
}

/** A draft is never your turn, not even when it asks for your review: it is not ready for one (the desktop's `yourTurn`). */
export function bucketFor(pr: PrRecord, ctx: FocusContext): FocusBucket {
  if (isStale(pr, ctx)) return 'stale';
  if (!pr.isDraft && isNeedsYou(pr, ctx.login, ctx.teams)) return isSnoozed(pr, ctx) ? 'wait' : 'you';
  if (isReady(pr)) return 'ready';
  return 'wait';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "just now", "12 min ago", "5 h ago", "3 days ago". */
export function formatAgo(iso: string | null, now: number): string {
  if (!iso) return '';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60_000) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  return `${plural(Math.floor(ms / DAY), 'day')} ago`;
}

/** A person as a sentence names them: the first name GitHub knows, else the login. */
export const firstName = (person: Person) => person.name?.trim().split(/\s+/)[0] || person.login;

function names(list: string[]): string {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]} and ${list.length - 1} others`;
}

function failingPart(pr: PrRecord): string {
  const failed = pr.checks.filter((c) => c.state === 'failure').length;
  return failed > 0 ? `${plural(failed, 'check')} failing` : 'checks failing';
}

/** Your latest review of the pull request, if you left one. */
export function myReview(pr: PrRecord, login: string): ReviewRecord | null {
  return pr.latestReviews.find((r) => lower(r.login) === lower(login) && r.state !== 'pending') ?? null;
}

/** Commits pushed after `sha`, from the newest twenty; null when `sha` is older than those. */
export function commitsSince(pr: PrRecord, sha: string): number | null {
  const index = pr.recentCommits.indexOf(sha);
  return index < 0 ? null : pr.recentCommits.length - 1 - index;
}

function askedForReview(pr: PrRecord, ctx: FocusContext): PrReason {
  const who = firstName(pr.author);
  const mine = myReview(pr, ctx.login);
  if (mine?.commitSha && mine.commitSha !== pr.headSha) {
    const since = commitsSince(pr, mine.commitSha);
    const commits = since === null ? 'new commits' : `${plural(since, 'new commit')}`;
    return { text: `${who} asked you to look again, ${commits} since your review.`, tone: 'warn', icon: 'rerun' };
  }
  const direct = pr.requestedReviewers.some((r) => lower(r) === lower(ctx.login));
  const team = direct ? undefined : matchedTeams(pr.requestedTeams, ctx.teams)[0];
  const ago = formatAgo(ctx.reviewRequestedAt(prKey(pr)) ?? pr.updatedAt, ctx.now);
  const whom = team ? `the ${team} team for a review` : 'for your review';
  return { text: `${who} asked ${whom}${ago ? ` ${ago}` : ''}.`, tone: 'warn', icon: 'review' };
}

/** Why the pull request sits in its bucket; the same order of rules as `bucketFor`. */
export function reasonFor(pr: PrRecord, ctx: FocusContext): PrReason {
  const mine = isMine(pr, ctx.login);
  const bucket = bucketFor(pr, ctx);
  const status = reviewStatus(pr);

  if (bucket === 'stale') {
    const days = Math.max(1, Math.floor((ctx.now - Date.parse(pr.updatedAt)) / DAY));
    return { text: `No update in ${plural(days, 'day')}.`, tone: 'mute', icon: 'clock' };
  }

  if (bucket === 'you') {
    if (mine && isFailing(pr)) return { text: `Your PR, ${failingPart(pr)}.`, tone: 'bad', icon: 'failing' };
    if (isWaitingOnMe(pr, ctx.login, ctx.teams)) return askedForReview(pr, ctx);
    if (status === 'changesRequested') return { text: 'Changes requested on your PR.', tone: 'bad', icon: 'comment' };
    return { text: 'Comments on your PR to answer.', tone: 'warn', icon: 'comment' };
  }

  if (bucket === 'ready') {
    const relevant = pr.checks.filter((c) => c.state !== 'skipped' && c.state !== 'neutral').length;
    const approvers = pr.latestReviews.filter((r) => r.state === 'approved').map((r) => r.login);
    const by = approvers.length ? ` by ${names(approvers)}` : '';
    return relevant > 0
      ? { text: `Approved${by}, all ${plural(relevant, 'check')} passed.`, tone: 'ok', icon: 'approved' }
      : { text: `Approved${by}, no checks to wait for.`, tone: 'ok', icon: 'approved' };
  }

  const author = mine ? 'Your PR' : `${firstName(pr.author)}'s PR`;
  if (pr.isDraft) {
    return { text: mine ? 'Draft, you are still working on it.' : `Draft, ${firstName(pr.author)} is still working on it.`, tone: 'mute', icon: 'clock' };
  }
  if (isNeedsYou(pr, ctx.login, ctx.teams) && isSnoozed(pr, ctx)) {
    const until = ctx.snoozedUntil(prKey(pr))!;
    const when = until - ctx.now < DAY ? 'tomorrow' : new Date(until).toISOString().slice(0, 10);
    return { text: `Snoozed until ${when}.`, tone: 'mute', icon: 'clock' };
  }
  if (pr.mergeable === 'conflicting') return { text: `${author} has merge conflicts.`, tone: 'bad', icon: 'conflict' };
  const running = pr.checks.filter((c) => c.state === 'pending').length;
  if (running > 0) {
    if (pr.autoMerge) return { text: `Merges when checks pass, ${pr.checks.length - running} of ${pr.checks.length} done.`, tone: 'run', icon: 'merge' };
    return { text: `Checks running, ${pr.checks.length - running} of ${pr.checks.length} done.`, tone: 'run', icon: 'clock' };
  }
  if (isFailing(pr)) return { text: `${author}, ${failingPart(pr)}.`, tone: 'bad', icon: 'failing' };
  const reviewers = [...pr.requestedReviewers, ...pr.requestedTeams];
  if (reviewers.length > 0) return { text: `${author}, waiting on ${names(reviewers)}.`, tone: 'mute', icon: 'review' };
  if (status === 'approved') return { text: `${author}, approved and waiting for checks.`, tone: 'ok', icon: 'approved' };
  if (mine) return { text: 'Your PR, waiting for a reviewer.', tone: 'mute', icon: 'review' };
  return { text: `${author}, not assigned to you.`, tone: 'mute', icon: 'review' };
}

/* ---------- urgency (priority-scoring.ts) ---------- */

/** The desktop's Focus score: points for things that need you to act. Others' drafts score nothing. */
export function scoreOf(pr: PrRecord, ctx: FocusContext): number {
  const me = lower(ctx.login);
  const mine = isMine(pr, ctx.login);
  if (pr.isDraft && !mine) return 0;
  const hoursAgo = (iso: string) => (ctx.now - Date.parse(iso)) / HOUR;
  const overall = overallStatus(pr.checks);
  const status = reviewStatus(pr);
  const updated = Date.parse(pr.updatedAt);
  let points = 0;

  if (mine && overall === 'green' && !pr.isDraft && pr.mergeable !== 'conflicting' && status === 'approved') points += 45;
  if (mine) {
    if (overall === 'red') points += 20;
    if (status === 'changesRequested') points += 15;
    if ((overall === 'red' || status === 'changesRequested') && hoursAgo(pr.updatedAt) > 24) points += 10;
    if (!pr.isDraft && status === 'none' && pr.latestReviews.length === 0) {
      const open = hoursAgo(pr.createdAt);
      if (open > 24) points += 15;
      else if (open > 8) points += 10;
    }
    if (!pr.isDraft && status === 'commented' && awaitingMyReply(pr, me, updated)) points += 12;
  }

  let requested = false;
  if (me) {
    const direct = pr.requestedReviewers.some((r) => lower(r) === me);
    const viaTeam = !direct && !mine && matchedTeams(pr.requestedTeams, ctx.teams).length > 0;
    if (direct || viaTeam) {
      requested = true;
      points += 15;
      const at = ctx.reviewRequestedAt(prKey(pr));
      if (at) {
        const hours = hoursAgo(at);
        if (hours >= 24) points += 8;
        else if (hours >= 4) points += 7;
      }
    }
  }

  if (!mine && me && !requested) {
    const reviewed = myReview(pr, ctx.login)?.submittedAt;
    if (reviewed && updated > Date.parse(reviewed) + ACTIVITY_SLACK_MS) points += 8;
  }

  const hours = hoursAgo(pr.updatedAt);
  if (hours > 24) points += Math.min(10, Math.floor((hours - 24) / 24) + 2);
  if (!mine && overall === 'red') points += 5;
  return points;
}

function awaitingMyReply(pr: PrRecord, me: string, updatedMs: number): boolean {
  const others = pr.latestReviews.filter((r) => lower(r.login) !== me && (r.state === 'commented' || r.state === 'changes_requested'));
  if (others.length === 0) return pr.latestReviews.length === 0;
  const stamped = others.map((r) => (r.submittedAt ? Date.parse(r.submittedAt) : Number.NaN));
  if (stamped.some(Number.isNaN)) return true;
  return Math.max(...stamped) + ACTIVITY_SLACK_MS >= updatedMs;
}

/** Bucket order, then most urgent, then the oldest update, then the smallest change. */
export function compareFocus(
  a: { bucket: FocusBucket; score: number; updatedAt: string; size: number },
  b: { bucket: FocusBucket; score: number; updatedAt: string; size: number },
): number {
  return FOCUS_BUCKETS.indexOf(a.bucket) - FOCUS_BUCKETS.indexOf(b.bucket)
    || b.score - a.score
    || Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    || a.size - b.size;
}

/** AB#123 references in the title, body or branch (`feat/123-…` counts too). */
export function workItemIdsOf(pr: { title: string; body: string; headRef: string }): number[] {
  const ids = new Set<number>();
  for (const m of `${pr.title}\n${pr.body}`.matchAll(/\bAB#(\d{2,7})\b/gi)) ids.add(Number(m[1]));
  const branch = /^(?:[a-z]+\/)?(\d{3,7})(?:[-_/]|$)/i.exec(pr.headRef);
  if (branch) ids.add(Number(branch[1]));
  return [...ids];
}
