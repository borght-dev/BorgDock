import { useEffect } from 'react';
import { getClientForRepo } from '@/services/github/singleton';
import { loadCachedReviewSnapshot } from '@/services/quick-review';
import { ensureReviewGuide } from '@/stores/review-guide-store';
import { ensureRiskAssessment } from '@/stores/risk-assessment-store';
import type { PullRequest } from '@/types';

/**
 * Loads a PR's files before its review opens. With `guide`, its review guide
 * is written ahead too: the agent needs half a minute, and the PR before it
 * takes longer than that to read. With `risk`, its regression risk is
 * assessed ahead the same way, unless automatic assessment is off or paused.
 */
export function usePrefetchReviewSnapshot(
  pr: PullRequest | undefined,
  { guide = false, risk = false }: { guide?: boolean; risk?: boolean } = {},
) {
  const client = pr ? getClientForRepo(pr.repoOwner, pr.repoName) : null;
  useEffect(() => {
    if (!client || !pr || pr.state.toLowerCase() !== 'open') return;
    let current = true;
    // Opening the review retries a failed preload and displays any error.
    void loadCachedReviewSnapshot(client, pr)
      .then((snapshot) => {
        if (!current) return;
        if (guide) void ensureReviewGuide(snapshot);
        if (risk) void ensureRiskAssessment(snapshot, { background: true });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [client, pr, guide, risk]);
}
