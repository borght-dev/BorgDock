import { useEffect } from 'react';
import { getClientForRepo } from '@/services/github/singleton';
import { loadCachedReviewSnapshot } from '@/services/quick-review';
import type { PullRequest } from '@/types';

export function usePrefetchReviewSnapshot(pr: PullRequest | undefined) {
  const client = pr ? getClientForRepo(pr.repoOwner, pr.repoName) : null;
  useEffect(() => {
    if (!client || !pr || pr.state.toLowerCase() !== 'open') return;
    // Opening the review retries a failed preload and displays any error.
    void loadCachedReviewSnapshot(client, pr).catch(() => {});
  }, [client, pr]);
}
