import { getReviewSlaTier } from '@/services/review-sla';
import type { PullRequestWithChecks } from '@/types';

export interface ReviewerLoad {
  login: string;
  pendingReviewCount: number;
  stalePrCount: number;
  avgWaitHours: number;
}

export function computeTeamReviewLoad(
  prs: PullRequestWithChecks[],
  reviewRequestTimestamps: Record<string, string>,
): ReviewerLoad[] {
  const byReviewer = new Map<
    string,
    { pending: number; stale: number; totalWaitMs: number; timestampCount: number }
  >();

  for (const pr of prs) {
    for (const reviewer of pr.pullRequest.requestedReviewers) {
      const login = reviewer.toLowerCase();
      const key = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}:${login}`;
      const requestedAt = reviewRequestTimestamps[key];

      let entry = byReviewer.get(login);
      if (!entry) {
        entry = { pending: 0, stale: 0, totalWaitMs: 0, timestampCount: 0 };
        byReviewer.set(login, entry);
      }

      entry.pending++;

      if (requestedAt) {
        const tier = getReviewSlaTier(requestedAt);
        if (tier === 'stale') entry.stale++;
        entry.totalWaitMs += Date.now() - new Date(requestedAt).getTime();
        entry.timestampCount++;
      }
    }
  }

  const result: ReviewerLoad[] = [];
  for (const [login, entry] of byReviewer) {
    result.push({
      login,
      pendingReviewCount: entry.pending,
      stalePrCount: entry.stale,
      avgWaitHours:
        entry.timestampCount > 0
          ? Math.round(entry.totalWaitMs / entry.timestampCount / (1000 * 60 * 60))
          : 0,
    });
  }

  return result.sort((a, b) => b.pendingReviewCount - a.pendingReviewCount);
}
