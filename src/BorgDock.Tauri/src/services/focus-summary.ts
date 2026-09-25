import { isMyPr, isWaitingOnMe } from '@/services/pr-grouping';
import type { PullRequestWithChecks } from '@/types';

const UNREVIEWED_AFTER_HOURS = 8;

/** Human reason a PR scored 0 (or was excluded up front). */
export function explainZeroScore(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): string {
  const p = pr.pullRequest;
  const mine = isMyPr(pr, username);

  if (!mine) {
    if (p.isDraft) return 'Drafts by others';
    if (pr.overallStatus === 'yellow') return 'By others, checks still running';
    if (isWaitingOnMe(pr, username, teams)) return 'By others, waiting on you';
    if (p.requestedReviewers.length > 0 || (p.requestedTeams?.length ?? 0) > 0) {
      return 'By others, waiting on other reviewers';
    }
    if (p.reviewStatus === 'approved') return 'By others, approved and green';
    return 'By others, green and no review requested from you';
  }

  if (p.isDraft) return 'Your drafts';
  if (pr.overallStatus === 'yellow') return 'Yours, checks still running';
  if (p.reviewStatus === 'approved') {
    if (p.mergeable === false) return 'Yours, approved but has conflicts';
    return 'Yours, approved but checks not green';
  }
  if (p.reviewStatus === 'none') {
    const openHours = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60);
    if (openHours <= UNREVIEWED_AFTER_HOURS) return 'Yours, opened less than 8h ago';
    return 'Yours, awaiting a first review';
  }
  if (p.reviewStatus === 'commented') return 'Yours, you replied last';
  return 'Yours, nothing pending';
}
