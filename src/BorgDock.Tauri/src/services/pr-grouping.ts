import { isTeamRequested } from '@/services/team-membership';
import type { PullRequestWithChecks } from '@/types';

// ── predicates (shared with the store filters) ─────────────────────────────

export function isMyPr(pr: PullRequestWithChecks, username: string): boolean {
  return username !== '' && pr.pullRequest.authorLogin.toLowerCase() === username.toLowerCase();
}

export function isFailing(pr: PullRequestWithChecks): boolean {
  return pr.overallStatus === 'red';
}

export function isReady(pr: PullRequestWithChecks): boolean {
  return (
    !pr.checksUnavailable &&
    pr.overallStatus === 'green' &&
    !pr.pullRequest.isDraft &&
    pr.pullRequest.mergeable !== false &&
    pr.pullRequest.reviewStatus === 'approved'
  );
}

/** Some reviewer's latest review is commented / changes requested / pending. */
export function isReviewing(pr: PullRequestWithChecks): boolean {
  const status = pr.pullRequest.reviewStatus;
  return status !== 'none' && status !== 'approved';
}

/** The user is still a pending requested reviewer — personally or via a team. */
export function isWaitingOnMe(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): boolean {
  if (!username) return false;
  if (isMyPr(pr, username)) return false;
  const me = username.toLowerCase();
  if (
    pr.pullRequest.latestReviews?.some(
      (review) =>
        review.authorLogin.toLowerCase() === me &&
        review.state === 'approved' &&
        (!review.commitSha ||
          !pr.pullRequest.headSha ||
          review.commitSha === pr.pullRequest.headSha),
    )
  )
    return false;
  if (pr.pullRequest.requestedReviewers.some((r) => r.toLowerCase() === me)) return true;
  return isTeamRequested(pr.pullRequest.requestedTeams, teams);
}

/**
 * "Needs you" in the Workbench list (plans/ui-overhaul-workbench.md, phase 2,
 * after the iteration-2 mockup's `bucket()`): a review is requested from me
 * (personally or through a team), or it is my PR and its checks fail, or it
 * is my PR and a reviewer asked for changes or left comments.
 *
 * Unlike the mockup's Board bucket, a stale PR still needs you here: the
 * list filter answers "what is waiting on me", and an old review request is
 * still waiting. The Board (phase 5) can put stale PRs in their own column.
 */
export function isNeedsYou(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): boolean {
  if (!username) return false;
  if (isWaitingOnMe(pr, username, teams)) return true;
  if (!isMyPr(pr, username)) return false;
  if (isFailing(pr)) return true;
  const status = pr.pullRequest.reviewStatus;
  return status === 'changesRequested' || status === 'commented';
}
