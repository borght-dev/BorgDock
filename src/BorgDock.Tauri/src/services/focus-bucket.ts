import { isFailing, isMyPr, isNeedsYou, isReady, isWaitingOnMe } from '@/services/pr-grouping';
import { prScoreKey } from '@/services/priority-scoring';
import { matchedTeams } from '@/services/team-membership';
import type { PullRequestWithChecks } from '@/types';
import { formatAgo, isOlderThanDays, STALE_AFTER_DAYS } from '@/utils/relative-time';

/**
 * Focus buckets (plans/ui-overhaul-workbench.md, phase 5), ported from the
 * iteration-2 mockup's `bucket()` and `why()`. One function places a pull
 * request, so the Focus count strip, the Board columns and the list filter
 * cannot disagree:
 *
 * - `stale`: open with no update in `staleAfterDays` days. Checked first, so
 *   an old review request sits in Stale instead of Needs you.
 * - `you`: the Pull requests list's "Needs you" rule (`isNeedsYou`): a
 *   review requested from me (personally or through a team), or my PR with
 *   failing checks, changes requested or comments. A snoozed PR ("Later")
 *   waits instead, until the snooze runs out.
 * - `ready`: approved, checks green, not a draft, no conflicts (`isReady`).
 * - `wait`: everything else — someone else has the ball.
 *
 * Unlike the mockup, Needs you is checked before Ready: a review still
 * requested from me on an approved, green PR is waiting on me, which is
 * what the Pull requests list says too.
 */
export type FocusBucket = 'you' | 'wait' | 'ready' | 'stale';

/** Column and count-strip order. */
export const FOCUS_BUCKETS: readonly FocusBucket[] = ['you', 'wait', 'ready', 'stale'];

export const FOCUS_BUCKET_LABEL: Record<FocusBucket, string> = {
  you: 'Needs you',
  wait: 'Waiting on others',
  ready: 'Ready to merge',
  stale: 'Stale',
};

/** The count strip's filter: one bucket, or everything. */
export type FocusFilter = FocusBucket | 'all';

export interface FocusBucketContext {
  username: string;
  /** Team slugs I belong to: a team review request counts as mine. */
  teams?: readonly string[];
  /** Clock for the stale rule, the snooze and the reason's age. */
  now: number;
  /** An open PR with no update for this many days is stale (`ui.staleAfterDays`). */
  staleAfterDays: number;
  /**
   * When my review was requested on `pr` (direct, else through a team), for
   * the reason sentence. Defaults to the PR's last update.
   */
  reviewRequestedAt?: (pr: PullRequestWithChecks) => string | undefined;
  /** Snoozed PRs: `owner/repo#number` → snoozed until (epoch ms). */
  snoozedUntil?: Readonly<Record<string, number>>;
}

const DAY = 24 * 60 * 60 * 1000;

/** Key of a PR in the snooze map and on the Board's cards: `owner/repo#number`. */
export function focusKey(pr: PullRequestWithChecks): string {
  return prScoreKey(pr.pullRequest);
}

/** Longest stale threshold the setting takes (the Appearance field's max). */
export const STALE_AFTER_DAYS_MAX = 90;

/**
 * The `ui.staleAfterDays` setting as whole days from 1 to
 * `STALE_AFTER_DAYS_MAX`: the default for a missing or bad value, clamped
 * for one out of range (a hand-edited settings file).
 */
export function staleAfterDaysOf(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return STALE_AFTER_DAYS;
  return Math.min(Math.floor(value), STALE_AFTER_DAYS_MAX);
}

/**
 * The one stale rule, shared by the Focus buckets and the rows' meta line:
 * an open PR whose last update is `staleAfterDays` days or more before `now`.
 */
export function isStaleUpdate(
  pr: { open: boolean; updatedAt?: string },
  staleAfterDays: number,
  now: number,
): boolean {
  return (
    pr.open && pr.updatedAt !== undefined && isOlderThanDays(pr.updatedAt, staleAfterDays, now)
  );
}

function isOpen(pr: PullRequestWithChecks): boolean {
  const p = pr.pullRequest;
  return p.state === 'open' && !p.mergedAt && !p.closedAt;
}

/** Open, with no update for `ctx.staleAfterDays` days. */
export function isStaleFor(pr: PullRequestWithChecks, ctx: FocusBucketContext): boolean {
  return isStaleUpdate(
    { open: isOpen(pr), updatedAt: pr.pullRequest.updatedAt },
    ctx.staleAfterDays,
    ctx.now,
  );
}

/** Snoozed with "Later" and the snooze has not run out. */
export function isSnoozed(pr: PullRequestWithChecks, ctx: FocusBucketContext): boolean {
  const until = ctx.snoozedUntil?.[focusKey(pr)];
  return until !== undefined && until > ctx.now;
}

export function bucketFor(pr: PullRequestWithChecks, ctx: FocusBucketContext): FocusBucket {
  if (isStaleFor(pr, ctx)) return 'stale';
  // A snoozed review waits, even on a PR that is otherwise ready.
  if (isNeedsYou(pr, ctx.username, ctx.teams)) return isSnoozed(pr, ctx) ? 'wait' : 'you';
  if (isReady(pr)) return 'ready';
  return 'wait';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "mira", "mira and sasha", "mira and 2 others". */
function names(list: string[]): string {
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]} and ${list.length - 1} others`;
}

function failingPart(pr: PullRequestWithChecks): string {
  const fail = pr.failedCheckNames.length;
  return fail > 0 ? `${plural(fail, 'check')} failing` : 'checks failing';
}

function askedForReview(pr: PullRequestWithChecks, ctx: FocusBucketContext): string {
  const p = pr.pullRequest;
  const me = ctx.username.toLowerCase();
  const direct = p.requestedReviewers.some((r) => r.toLowerCase() === me);
  const team = direct ? undefined : matchedTeams(p.requestedTeams, ctx.teams ?? [])[0];
  const at = ctx.reviewRequestedAt?.(pr) ?? p.updatedAt;
  const ago = formatAgo(at, ctx.now);
  const whom = team ? `the ${team} team for a review` : 'for your review';
  return `${p.authorLogin} asked ${whom}${ago ? ` ${ago}` : ''}.`;
}

/**
 * The one-line reason a PR sits where `bucketFor` put it: "mira asked for
 * your review 5 h ago.", "Your PR, 2 checks failing.", "Approved and all 80
 * checks passed.", "No update in 12 days.". Same order of rules as
 * `bucketFor`, so the sentence always explains the column.
 */
export function whyFor(pr: PullRequestWithChecks, ctx: FocusBucketContext): string {
  const p = pr.pullRequest;
  const mine = isMyPr(pr, ctx.username);
  const bucket = bucketFor(pr, ctx);

  if (bucket === 'stale') {
    const days = Math.max(1, Math.floor((ctx.now - new Date(p.updatedAt).getTime()) / DAY));
    return `No update in ${plural(days, 'day')}.`;
  }

  if (bucket === 'you') {
    if (mine && isFailing(pr)) return `Your PR, ${failingPart(pr)}.`;
    if (isWaitingOnMe(pr, ctx.username, ctx.teams)) return askedForReview(pr, ctx);
    if (p.reviewStatus === 'changesRequested') return 'Changes requested on your PR.';
    return 'Comments on your PR to answer.';
  }

  if (bucket === 'ready') {
    const relevant = pr.totalCheckCount - pr.skippedCount;
    return relevant > 0
      ? `Approved and all ${plural(relevant, 'check')} passed.`
      : 'Approved, no checks to wait for.';
  }

  // Waiting on others: say who or what.
  const author = mine ? 'Your PR' : `${p.authorLogin}'s PR`;
  if (isNeedsYou(pr, ctx.username, ctx.teams) && isSnoozed(pr, ctx)) {
    return 'Snoozed until tomorrow.';
  }
  if (p.isDraft) {
    return mine
      ? 'Draft, you are still working on it.'
      : `Draft, ${p.authorLogin} is still working on it.`;
  }
  if (p.mergeable === false) return `${author} has merge conflicts.`;
  const run = pr.pendingCheckNames.length;
  if (run > 0 || pr.overallStatus === 'yellow') {
    const total = pr.totalCheckCount;
    return total > 0 ? `Checks running, ${total - run} of ${total} done.` : 'Checks running.';
  }
  if (isFailing(pr)) return `${author}, ${failingPart(pr)}.`;
  const reviewers = [...p.requestedReviewers, ...(p.requestedTeams ?? [])];
  if (reviewers.length > 0) return `${author}, waiting on ${names(reviewers)}.`;
  if (p.reviewStatus === 'approved') return `${author}, approved and waiting for checks.`;
  if (mine) return 'Your PR, waiting for a reviewer.';
  return `${author}, not assigned to you.`;
}

/** Count per bucket, plus `all`. */
export function countBuckets(
  prs: readonly PullRequestWithChecks[],
  ctx: FocusBucketContext,
): Record<FocusFilter, number> {
  const counts: Record<FocusFilter, number> = {
    all: prs.length,
    you: 0,
    wait: 0,
    ready: 0,
    stale: 0,
  };
  for (const pr of prs) counts[bucketFor(pr, ctx)]++;
  return counts;
}

/**
 * What Focus shows: the priority-ranked Focus PRs, plus any PR the "Needs
 * you" rule catches that scored nothing (an answered comment thread, a team
 * request on a draft), appended in their list order. That way the Needs you
 * count here always equals the Pull requests list's, less the stale ones.
 */
export function focusSetOf(
  focusPrs: readonly PullRequestWithChecks[],
  allPrs: readonly PullRequestWithChecks[],
  username: string,
  teams: readonly string[] = [],
): PullRequestWithChecks[] {
  const inFocus = new Set(focusPrs.map(focusKey));
  const extra = allPrs.filter(
    (pr) => !inFocus.has(focusKey(pr)) && isNeedsYou(pr, username, teams),
  );
  return extra.length === 0 ? [...focusPrs] : [...focusPrs, ...extra];
}

/** Start of the next local day: "Later" snoozes until then. */
export function startOfTomorrow(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** My PRs merged since local midnight, for the "Merged today" tally. */
export function mergedTodayKeys(
  closed: readonly PullRequestWithChecks[],
  now: number,
  username: string,
): string[] {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const midnight = d.getTime();
  return closed
    .filter((pr) => {
      if (!isMyPr(pr, username)) return false;
      const at = pr.pullRequest.mergedAt;
      return at !== undefined && new Date(at).getTime() >= midnight;
    })
    .map(focusKey);
}
