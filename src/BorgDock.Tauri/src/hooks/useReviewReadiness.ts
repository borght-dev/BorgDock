import { useEffect, useState } from 'react';
import { getReviewReadiness, type ReviewReadiness } from '@/services/github/review-readiness';
import { getClientForRepo } from '@/services/github/singleton';
import type { PullRequest } from '@/types';

export function useReviewReadiness(pr: PullRequest) {
  const { repoOwner, repoName, baseRef, headSha } = pr;
  const client = getClientForRepo(repoOwner, repoName);
  const [result, setResult] = useState<ReviewReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setLoading(false);
    if (!client || !headSha) return;
    setLoading(true);
    void getReviewReadiness(client, repoOwner, repoName, baseRef, headSha)
      .then((result) => {
        if (!cancelled) setResult(result);
      })
      .catch(() => {
        if (!cancelled)
          setResult({ checks: [], complete: false, warnings: ['Required checks unavailable'] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, repoOwner, repoName, baseRef, headSha]);
  return { result, loading };
}
