import type { ActionTarget } from './types';

/** The button an action gets. Kept apart from `actions.ts` so the flyout can name actions without loading them. */
export function actionLabel(action: ActionTarget): string {
  switch (action.kind) {
    case 'answer':
      return action.option ? `Answer: ${action.option}` : 'Answer';
    case 'approve-plan':
      return 'Approve plan';
    case 'open-thread':
      return 'Open thread';
    case 'open-item':
      return 'Open item';
    case 'open-pr':
      return action.tab === 'checks'
        ? 'Open checks'
        : action.tab === 'reviews'
          ? 'Open reviews'
          : 'Open PR';
    case 'review-pr':
      return 'Review';
    case 'fix-checks':
      return 'Fix checks';
    case 'merge':
      return 'Merge';
    case 'open-ci-group':
      return 'Open failure group';
    case 'open-workstream':
      return 'Open workstream';
    case 'open-url':
      return /\/actions\/runs\//.test(action.url) ? 'Open run log' : 'Open';
  }
}
