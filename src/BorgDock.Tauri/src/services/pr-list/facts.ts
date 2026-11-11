import { isStaleUpdate } from '@/services/focus-bucket';
import { isFailing, isMyPr, isReady, isWaitingOnMe } from '@/services/pr-grouping';
import { abReferences } from '@/services/work-item-linker';
import type { PullRequestWithChecks } from '@/types';

/**
 * What the Pull requests list knows about one open PR, derived once per poll
 * and shared by the filters, the query, the sort, the groups, the rows and
 * the board. Pure: everything outside the PR comes in through
 * `PrFactsContext`.
 */

/** Status buckets, in the order the Status grouping and the board show them. */
export type PrStatusBucket = 'yourTurn' | 'failing' | 'waiting' | 'ready' | 'draft';

export const STATUS_BUCKET_ORDER: readonly PrStatusBucket[] = [
  'yourTurn',
  'failing',
  'waiting',
  'ready',
  'draft',
];

export const STATUS_BUCKET_LABEL: Record<PrStatusBucket, string> = {
  yourTurn: 'Your turn',
  failing: 'Failing',
  waiting: 'Waiting for review',
  ready: 'Ready to merge',
  draft: 'Draft',
};

export const STATUS_BUCKET_HINT: Record<PrStatusBucket, string> = {
  yourTurn: 'your review is requested, or your PR needs a fix or a reply',
  failing: 'red checks on someone else’s PR',
  waiting: 'green or running, no approval yet',
  ready: 'approved, green, no conflicts',
  draft: 'not ready for review',
};

/** Where the reviews stand, from my point of view. */
export type ReviewKey =
  | 'awaitingYou'
  | 'changes'
  | 'commented'
  | 'awaitingOthers'
  | 'approved'
  | 'none';

export const REVIEW_ORDER: readonly ReviewKey[] = [
  'awaitingYou',
  'changes',
  'commented',
  'awaitingOthers',
  'approved',
  'none',
];

export const REVIEW_LABEL: Record<ReviewKey, string> = {
  awaitingYou: 'Awaiting your review',
  changes: 'Changes requested',
  commented: 'Commented',
  awaitingOthers: 'Awaiting other reviewers',
  approved: 'Approved',
  none: 'No reviewers',
};

/** Who has to act before the PR moves on. */
export type WaitingOn = 'you' | 'author' | 'reviewers' | 'ci';

export const WAITING_ORDER: readonly WaitingOn[] = ['you', 'author', 'reviewers', 'ci'];

export const WAITING_LABEL: Record<WaitingOn, string> = {
  you: 'Waiting on you',
  author: 'Waiting on the author',
  reviewers: 'Waiting on reviewers',
  ci: 'Waiting on CI',
};

/** How the next step pill reads: yours, good to go, blocked, running, someone else's. */
export type NextTone = 'you' | 'go' | 'block' | 'wait' | 'them';

export interface NextStep {
  label: string;
  waitingOn: WaitingOn;
  tone: NextTone;
}

export type SizeBucket = 'xs' | 's' | 'm' | 'l' | 'xl';

export const SIZE_ORDER: readonly SizeBucket[] = ['xs', 's', 'm', 'l', 'xl'];

export const SIZE_LABEL: Record<SizeBucket, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
};

export const SIZE_GROUP_LABEL: Record<SizeBucket, string> = {
  xs: 'XS · under 10 lines',
  s: 'S · under 100 lines',
  m: 'M · under 500 lines',
  l: 'L · under 1,000 lines',
  xl: 'XL · 1,000 lines or more',
};

/** Upper bounds (exclusive) of the size buckets, in changed lines. */
const SIZE_LIMITS: ReadonlyArray<[SizeBucket, number]> = [
  ['xs', 10],
  ['s', 100],
  ['m', 500],
  ['l', 1000],
];

export type AgeBucket = 'today' | 'week' | 'month' | 'older';

export const AGE_ORDER: readonly AgeBucket[] = ['today', 'week', 'month', 'older'];

export const AGE_LABEL: Record<AgeBucket, string> = {
  today: 'Opened today',
  week: 'Opened this week',
  month: 'Opened this month',
  older: 'Older than a month',
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** What the CI failure store says about a red PR. */
export interface PrCiFacts {
  /** Open PRs the PR's worst shared failure fails, this one included. */
  blocked: number;
  /** Every failed check sits in a shared failure that is not the PR's doing. */
  outside: boolean;
}

export interface PrFactsContext {
  username: string;
  teams: readonly string[];
  /** Clock for age and staleness, to the minute (`minuteNow`). */
  now: number;
  staleAfterDays: number;
  /** The CI failure store's view of a PR, or null when none of its failures is shared. */
  ciOf: (pr: PullRequestWithChecks) => PrCiFacts | null;
}

export interface PrFacts {
  pr: PullRequestWithChecks;
  /** `owner/repo#number`. */
  key: string;
  mine: boolean;
  draft: boolean;
  conflicts: boolean;
  failing: boolean;
  running: boolean;
  ready: boolean;
  /** A review is requested from me, personally or through a team. */
  waitingOnMe: boolean;
  /** I have to act: my review, or my PR needs a fix, a reply or a rebase. */
  yourTurn: boolean;
  stale: boolean;
  bucket: PrStatusBucket;
  review: ReviewKey;
  next: NextStep;
  ci: PrCiFacts | null;
  /** Lines changed: additions plus deletions. */
  lines: number;
  size: SizeBucket;
  /** By when it was opened. */
  age: AgeBucket;
  /** `AB#` work items in the title, branch or description. */
  workItems: number[];
  createdAt: number;
  updatedAt: number;
}

export function sizeOf(lines: number): SizeBucket {
  for (const [bucket, limit] of SIZE_LIMITS) if (lines < limit) return bucket;
  return 'xl';
}

export function ageOf(createdAt: number, now: number): AgeBucket {
  const age = now - createdAt;
  if (age < DAY) return 'today';
  if (age < 7 * DAY) return 'week';
  if (age < 30 * DAY) return 'month';
  return 'older';
}

function timeOf(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

function reviewOf(pr: PullRequestWithChecks, waitingOnMe: boolean): ReviewKey {
  if (waitingOnMe) return 'awaitingYou';
  const p = pr.pullRequest;
  if (p.reviewStatus === 'changesRequested') return 'changes';
  if (p.reviewStatus === 'commented') return 'commented';
  if (p.reviewStatus === 'approved') return 'approved';
  if (pendingReviewers(pr).length > 0) return 'awaitingOthers';
  return 'none';
}

/** Requested reviewers still pending, people first then teams (`@team`). */
export function pendingReviewers(pr: PullRequestWithChecks): string[] {
  const p = pr.pullRequest;
  return [...p.requestedReviewers, ...(p.requestedTeams ?? []).map((t) => `@${t}`)];
}

interface NextInputs {
  pr: PullRequestWithChecks;
  username: string;
  mine: boolean;
  failing: boolean;
  running: boolean;
  ready: boolean;
  conflicts: boolean;
  waitingOnMe: boolean;
  ci: PrCiFacts | null;
}

/**
 * The one thing that has to happen next, and who does it. First match wins:
 * a draft, my own conflicts, my review, someone else's conflicts, red checks that
 * are the PR's own, requested changes, comments on my PR, red checks that
 * are not the PR's doing, checks still running, merge, and finally who
 * still has to review.
 */
export function nextStepOf(f: NextInputs): NextStep {
  const p = f.pr.pullRequest;
  const author = p.authorLogin;
  const me = f.username.toLowerCase();
  if (p.isDraft)
    return f.mine
      ? { label: 'Finish the draft', waitingOn: 'you', tone: 'you' }
      : { label: `Draft · ${author}`, waitingOn: 'author', tone: 'them' };
  if (f.conflicts && f.mine) return { label: 'Resolve conflicts', waitingOn: 'you', tone: 'you' };
  if (f.waitingOnMe) return { label: 'Your review', waitingOn: 'you', tone: 'you' };
  if (f.conflicts) return { label: `Conflicts · ${author}`, waitingOn: 'author', tone: 'block' };
  const ownFailure = f.failing && !f.ci?.outside;
  if (ownFailure)
    return f.mine
      ? { label: 'Fix checks', waitingOn: 'you', tone: 'you' }
      : { label: `Fix checks · ${author}`, waitingOn: 'author', tone: 'block' };
  if (p.reviewStatus === 'changesRequested')
    return f.mine
      ? { label: 'Address changes', waitingOn: 'you', tone: 'you' }
      : { label: `Address changes · ${author}`, waitingOn: 'author', tone: 'them' };
  if (f.mine && p.reviewStatus === 'commented')
    return { label: 'Reply to comments', waitingOn: 'you', tone: 'you' };
  if (f.failing) return { label: 'Blocked by shared CI', waitingOn: 'ci', tone: 'block' };
  if (f.running) return { label: 'Checks running', waitingOn: 'ci', tone: 'wait' };
  if (f.ready)
    return f.mine
      ? { label: 'Merge', waitingOn: 'you', tone: 'go' }
      : { label: `Merge · ${author}`, waitingOn: 'author', tone: 'go' };
  const others = pendingReviewers(f.pr).filter((r) => r.toLowerCase() !== me);
  if (others.length > 0)
    return { label: `Review · ${others.join(', ')}`, waitingOn: 'reviewers', tone: 'them' };
  if (p.reviewStatus === 'approved')
    return { label: 'Checks unknown', waitingOn: 'ci', tone: 'wait' };
  if (p.reviewStatus === 'commented')
    return { label: `Reply · ${author}`, waitingOn: 'author', tone: 'them' };
  return f.mine
    ? { label: 'Request a review', waitingOn: 'you', tone: 'you' }
    : { label: 'Needs a reviewer', waitingOn: 'reviewers', tone: 'them' };
}

/** The facts of one open PR. */
export function factsOf(pr: PullRequestWithChecks, ctx: PrFactsContext): PrFacts {
  const p = pr.pullRequest;
  const mine = isMyPr(pr, ctx.username);
  const failing = isFailing(pr);
  const running = !failing && pr.pendingCheckNames.length > 0;
  const conflicts = p.mergeable === false;
  const ready = isReady(pr);
  const waitingOnMe = isWaitingOnMe(pr, ctx.username, ctx.teams);
  const ci = failing ? ctx.ciOf(pr) : null;
  // A draft is never your turn, not even when it asks for your review: it is
  // not ready for one.
  const yourTurn =
    !p.isDraft &&
    (waitingOnMe ||
      (mine &&
        ((failing && !ci?.outside) ||
          conflicts ||
          p.reviewStatus === 'changesRequested' ||
          p.reviewStatus === 'commented')));
  const bucket: PrStatusBucket = p.isDraft
    ? 'draft'
    : yourTurn
      ? 'yourTurn'
      : ready
        ? 'ready'
        : failing
          ? 'failing'
          : 'waiting';
  const lines = (p.additions ?? 0) + (p.deletions ?? 0);
  const createdAt = timeOf(p.createdAt);
  const updatedAt = timeOf(p.updatedAt);
  return {
    pr,
    key: `${p.repoOwner}/${p.repoName}#${p.number}`,
    mine,
    draft: p.isDraft,
    conflicts,
    failing,
    running,
    ready,
    waitingOnMe,
    yourTurn,
    stale: isStaleUpdate({ open: true, updatedAt: p.updatedAt }, ctx.staleAfterDays, ctx.now),
    bucket,
    review: reviewOf(pr, waitingOnMe),
    next: nextStepOf({
      pr,
      username: ctx.username,
      mine,
      failing,
      running,
      ready,
      conflicts,
      waitingOnMe,
      ci,
    }),
    ci,
    lines,
    size: sizeOf(lines),
    age: ageOf(createdAt, ctx.now),
    workItems: [...new Set(abReferences(`${p.title} ${p.headRef} ${p.body ?? ''}`))],
    createdAt,
    updatedAt,
  };
}

/** A PR title split for the row: a muted conventional-commit scope, the subject, its `AB#` items. */
export interface TitleParts {
  /** `fix(grids):`, or empty. */
  scope: string;
  subject: string;
  workItems: number[];
}

// Lower-case types only (`fix(grids):`), so "Site: drop …" stays a plain title.
const SCOPE_PATTERN = /^([a-z]+(?:\([^)]*\))?!?:)\s+(.+)$/;
const AB_TOKEN = /\(\s*AB#\d+\s*\)|\bAB#\d+\b:?/gi;

export function splitTitle(title: string): TitleParts {
  const workItems = abReferences(title);
  let subject = title
    .replace(AB_TOKEN, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (subject === '') subject = title.trim();
  const match = SCOPE_PATTERN.exec(subject);
  if (!match) return { scope: '', subject, workItems };
  return { scope: match[1]!, subject: match[2]!, workItems };
}
