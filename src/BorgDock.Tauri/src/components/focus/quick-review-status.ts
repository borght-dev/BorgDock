import { checkCountsFor } from '@/components/pr/pr-card-data';
import { checkBarSummary } from '@/components/shared/primitives';
import type { PullRequestWithChecks } from '@/types';

/** The one-line CI note under the check bar. */
export function ciNote(pr: PullRequestWithChecks): string {
  if (pr.checksUnavailable) return 'CI status unavailable';
  switch (checkBarSummary(checkCountsFor(pr)).state) {
    case 'fail':
      return 'CI is failing, review can wait';
    case 'run':
      return 'CI still running';
    case 'ok':
      return 'Reported checks passing';
    default:
      return 'No checks on this PR';
  }
}
