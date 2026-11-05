import { type RunFit, runFit } from '@/services/author-run';
import { usePrCiLens } from '@/stores/ci-failures-store';
import type { PullRequestWithChecks } from '@/types';
import { useE2eVerdict } from './useE2eVerdict';

/** Whether `pr` can be merged now, and if only past failures that are not its doing, why. */
export function useRunFit(pr: PullRequestWithChecks): RunFit {
  const e2e = useE2eVerdict(pr);
  const lens = usePrCiLens(pr);
  return runFit(pr, { e2e, outsideCause: lens?.outsideCause ?? null });
}
