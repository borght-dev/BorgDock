import { useEffect } from 'react';
import {
  type E2eRead,
  e2eNeighbours,
  e2eVerdictOf,
  ensureE2eReports,
  hasFailedE2e,
  useE2eStore,
} from '@/services/e2e/load';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';

/**
 * The verdict on `pr`'s failed E2E tests, and the checks its report covers:
 * null without a failed E2E check,
 * undefined while its report is read. Reads its report and its neighbours'
 * when their head or E2E run is one it hasn't read.
 */
export function useE2eVerdict(pr: PullRequestWithChecks): E2eRead | null | undefined {
  const prs = usePrStore((s) => s.pullRequests);
  const entries = useE2eStore((s) => s.entries);
  const failed = hasFailedE2e(pr);
  // Cheap on every poll: a PR whose head and E2E run were read is skipped.
  useEffect(() => {
    if (!failed) return;
    void ensureE2eReports([pr, ...e2eNeighbours(pr, usePrStore.getState().pullRequests)]);
  }, [pr, failed]);
  return e2eVerdictOf(pr, entries, prs);
}
