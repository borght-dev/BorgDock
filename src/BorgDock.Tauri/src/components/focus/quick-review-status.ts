import { checkCountsFor } from '@/components/pr/pr-card-data';
import { checkBarSummary } from '@/components/shared/primitives';
import type { PullRequestWithChecks } from '@/types';

/** The one-line CI note under the check bar. */
export function ciNote(pr: PullRequestWithChecks): string {
  switch (checkBarSummary(checkCountsFor(pr)).state) {
    case 'fail':
      return 'CI is failing, review can wait';
    case 'run':
      return 'CI still running';
    case 'ok':
      return 'reported checks passing';
    default:
      return 'no checks on this PR';
  }
}
