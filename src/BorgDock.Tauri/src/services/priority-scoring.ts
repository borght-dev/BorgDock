import { getReviewSlaTier } from '@/services/review-sla';
import { matchedTeams } from '@/services/team-membership';
import type { PrReview, PullRequestWithChecks } from '@/types';

/**
 * Every rule the Focus scorer can fire. Points are additive; a PR is "in
 * Focus" when its total is > 0. The rules encode one idea: *things that need
 * me to act* — failing builds on mine, reviews I owe (personal or via a team),
 * feedback on mine I have not answered, and my PRs nobody has looked at.
 */
export type PriorityFactorType =
  | 'readyToMerge'
  | 'myPrRedChecks'
  | 'myPrChangesRequested'
  | 'myPrStale'
  | 'myPrUnreviewed'
  | 'myPrCommented'
  | 'myReviewFollowUp'
  | 'reviewRequested'
  | 'teamReviewRequested'
  | 'reviewAging'
  | 'reviewStale'
  | 'staleness'
  | 'othersRedChecks';

export interface PriorityFactor {
  type: PriorityFactorType;
  points: number;
  label: string;
}

export interface PriorityScore {
  total: number;
  factors: PriorityFactor[];
  primaryReason: string;
}

/** Scores are keyed by `owner/repo#number` so numbers never collide across repos. */
export function prScoreKey(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

/** Key under which the store remembers when a *user* review request was first seen. */
export function reviewRequestKey(
  pr: { repoOwner: string; repoName: string; number: number },
  login: string,
): string {
  return `${prScoreKey(pr)}:${login.toLowerCase()}`;
}

/** Key under which the store remembers when a *team* review request was first seen. */
export function teamReviewRequestKey(
  pr: { repoOwner: string; repoName: string; number: number },
  slug: string,
): string {
  return `${prScoreKey(pr)}:team:${slug.toLowerCase()}`;
}

const UNREVIEWED_AFTER_HOURS = 8;
const UNREVIEWED_LONG_AFTER_HOURS = 24;
/** Slack when comparing a review timestamp against `updatedAt`, which GitHub
 *  bumps for the review itself a few hundred ms later. */
const ACTIVITY_SLACK_MS = 60 * 1000;

export function computePriorityScores(
  prs: PullRequestWithChecks[],
  username: string,
  reviewRequestTimestamps: Record<string, string>,
  teams: readonly string[] = [],
): Map<string, PriorityScore> {
  const scores = new Map<string, PriorityScore>();
  const me = username.toLowerCase();

  for (const pr of prs) {
    const p = pr.pullRequest;
    const isMine = me !== '' && p.authorLogin.toLowerCase() === me;

    // Others' drafts: excluded entirely
    if (p.isDraft && !isMine) continue;

    const factors: PriorityFactor[] = [];
    const updatedMs = new Date(p.updatedAt).getTime();

    // readyToMerge (0-45)
    if (
      isMine &&
      pr.overallStatus === 'green' &&
      !p.isDraft &&
      p.mergeable !== false &&
      p.reviewStatus === 'approved'
    ) {
      factors.push({ type: 'readyToMerge', points: 45, label: 'Ready to merge' });
    }

    // myPrNeedsAttention (0-35)
    if (isMine) {
      if (pr.overallStatus === 'red') {
        factors.push({ type: 'myPrRedChecks', points: 20, label: 'Build failing' });
      }
      if (p.reviewStatus === 'changesRequested') {
        factors.push({ type: 'myPrChangesRequested', points: 15, label: 'Changes requested' });
      }
      // Staleness bonus for own PR with unresolved issues
      if (
        (pr.overallStatus === 'red' || p.reviewStatus === 'changesRequested') &&
        hoursAgo(p.updatedAt) > 24
      ) {
        factors.push({ type: 'myPrStale', points: 10, label: `Stale ${daysAgo(p.updatedAt)}d` });
      }

      // myPrUnreviewed (10-15): nobody has looked at it since it was opened
      if (!p.isDraft && p.reviewStatus === 'none' && (p.latestReviews?.length ?? 0) === 0) {
        const openHours = hoursAgo(p.createdAt);
        if (openHours > UNREVIEWED_LONG_AFTER_HOURS) {
          factors.push({
            type: 'myPrUnreviewed',
            points: 15,
            label: `Unreviewed ${daysAgo(p.createdAt)}d`,
          });
        } else if (openHours > UNREVIEWED_AFTER_HOURS) {
          factors.push({
            type: 'myPrUnreviewed',
            points: 10,
            label: `Unreviewed ${Math.floor(openHours)}h`,
          });
        }
      }

      // myPrCommented (12): someone left comments and I have not responded
      if (
        !p.isDraft &&
        p.reviewStatus === 'commented' &&
        awaitingMyReply(p.latestReviews, me, updatedMs)
      ) {
        factors.push({ type: 'myPrCommented', points: 12, label: 'Comments to answer' });
      }
    }

    // reviewRequested (0-30) — directly, or via one of my teams
    let requested = false;
    if (me) {
      const isRequested = p.requestedReviewers.some((r) => r.toLowerCase() === me);
      if (isRequested) {
        requested = true;
        factors.push({ type: 'reviewRequested', points: 15, label: 'Review requested' });
        pushAgingFactors(factors, reviewRequestTimestamps[reviewRequestKey(p, me)]);
      } else {
        const viaTeams = isMine ? [] : matchedTeams(p.requestedTeams, teams);
        if (viaTeams.length > 0) {
          requested = true;
          factors.push({
            type: 'teamReviewRequested',
            points: 15,
            label: `Team review: ${viaTeams[0]}`,
          });
          const requestedAt = viaTeams
            .map((slug) => reviewRequestTimestamps[teamReviewRequestKey(p, slug)])
            .filter((ts): ts is string => !!ts)
            .sort()[0];
          pushAgingFactors(factors, requestedAt);
        }
      }
    }

    // myReviewFollowUp (8): I reviewed, the author pushed / replied since
    if (!isMine && me && !requested) {
      const myReview = p.latestReviews?.find((r) => r.authorLogin.toLowerCase() === me);
      const reviewedMs = myReview?.submittedAt ? new Date(myReview.submittedAt).getTime() : NaN;
      if (!Number.isNaN(reviewedMs) && updatedMs > reviewedMs + ACTIVITY_SLACK_MS) {
        factors.push({ type: 'myReviewFollowUp', points: 8, label: 'Updated since your review' });
      }
    }

    // staleness (0-10) — for any PR
    const hours = hoursAgo(p.updatedAt);
    if (hours > 24) {
      const stalePoints = Math.min(10, Math.floor((hours - 24) / 24) + 2);
      factors.push({
        type: 'staleness',
        points: stalePoints,
        label: `Stale ${daysAgo(p.updatedAt)}d`,
      });
    }

    // checkStatus (0-5) — red checks on others' PR
    if (!isMine && pr.overallStatus === 'red') {
      factors.push({ type: 'othersRedChecks', points: 5, label: 'Build failing' });
    }

    const total = factors.reduce((sum, f) => sum + f.points, 0);

    // Build primary reason from highest-point factor
    const sorted = [...factors].sort((a, b) => b.points - a.points);
    const primaryReason = sorted.map((f) => f.label).join(' · ') || 'Open PR';

    scores.set(prScoreKey(p), { total, factors: sorted, primaryReason });
  }

  return scores;
}

/**
 * "Someone commented on my PR and I have not answered." With review
 * timestamps we check whether the newest comment by someone else is the last
 * thing that happened to the PR (`updatedAt` moves on every push/comment).
 * Without timestamps (older cache entries) any non-approved review counts.
 */
function awaitingMyReply(reviews: PrReview[] | undefined, me: string, updatedMs: number): boolean {
  if (!reviews || reviews.length === 0) return true;
  const others = reviews.filter(
    (r) =>
      r.authorLogin.toLowerCase() !== me &&
      (r.state === 'commented' || r.state === 'changesRequested'),
  );
  if (others.length === 0) return false;
  const stamped = others.map((r) => (r.submittedAt ? new Date(r.submittedAt).getTime() : NaN));
  if (stamped.some((ms) => Number.isNaN(ms))) return true;
  const newestReview = Math.max(...stamped);
  return newestReview + ACTIVITY_SLACK_MS >= updatedMs;
}

function pushAgingFactors(factors: PriorityFactor[], requestedAt: string | undefined): void {
  if (!requestedAt) return;
  const tier = getReviewSlaTier(requestedAt);
  if (tier === 'aging') {
    factors.push({ type: 'reviewAging', points: 7, label: 'Review aging' });
  } else if (tier === 'stale') {
    factors.push({ type: 'reviewStale', points: 8, label: 'Review overdue' });
  }
}

export function sortByPriority(
  prs: PullRequestWithChecks[],
  scores: Map<string, PriorityScore>,
): PullRequestWithChecks[] {
  return [...prs]
    .filter((pr) => scores.has(prScoreKey(pr.pullRequest)))
    .sort((a, b) => {
      const sa = scores.get(prScoreKey(a.pullRequest))!;
      const sb = scores.get(prScoreKey(b.pullRequest))!;

      // Descending by score
      if (sb.total !== sa.total) return sb.total - sa.total;

      // Tie-break 1: oldest updatedAt first
      const aTime = new Date(a.pullRequest.updatedAt).getTime();
      const bTime = new Date(b.pullRequest.updatedAt).getTime();
      if (aTime !== bTime) return aTime - bTime;

      // Tie-break 2: smaller PR first
      const aSize = a.pullRequest.additions + a.pullRequest.deletions;
      const bSize = b.pullRequest.additions + b.pullRequest.deletions;
      return aSize - bSize;
    });
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

function daysAgo(dateStr: string): number {
  return Math.floor(hoursAgo(dateStr) / 24);
}
