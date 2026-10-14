import type { PullRequestWithChecks } from '@/types';

export function computeMergeScore(pr: PullRequestWithChecks): number {
  let score = 0;
  const relevant = pr.totalCheckCount - pr.skippedCount;

  // CI checks (25%)
  if (!pr.checksUnavailable) {
    score += relevant > 0 ? (pr.passedCount / relevant) * 25 : 25;
  }

  // Approvals (25%)
  if (pr.pullRequest.reviewStatus === 'approved') score += 25;
  else if (pr.pullRequest.reviewStatus === 'commented') score += 10;
  else if (pr.pullRequest.reviewStatus === 'pending') score += 5;

  // No conflicts (25%)
  if (pr.pullRequest.mergeable !== false) score += 25;

  // Not draft (25%)
  if (!pr.pullRequest.isDraft) score += 25;

  return Math.round(score);
}
