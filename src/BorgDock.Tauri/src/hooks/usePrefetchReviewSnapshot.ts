import { useEffect } from 'react';
import { getClientForRepo } from '@/services/github/singleton';
import { loadCachedReviewSnapshot } from '@/services/quick-review';
import { ensureReviewGuide } from '@/stores/review-guide-store';
import type { PullRequest } from '@/types';

/**
 * Loads a PR's files before its review opens. With `guide`, its review guide
 * is written ahead too: the agent needs half a minute, and the PR before it
 * takes longer than that to read.
 */
export function usePrefetchReviewSnapshot(
  pr: PullRequest | undefined,
  { guide = false }: { guide?: boolean } = {},
) {
  const client = pr ? getClientForRepo(pr.repoOwner, pr.repoName) : null;
  useEffect(() => {
    if (!client || !pr || pr.state.toLowerCase() !== 'open') return;
    let current = true;
    // Opening the review retries a failed preload and displays any error.
    void loadCachedReviewSnapshot(client, pr)
      .then((snapshot) => {
        if (guide && current) void ensureReviewGuide(snapshot);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [client, pr, guide]);
}
