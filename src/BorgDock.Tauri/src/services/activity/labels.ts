import type { ActionTarget, ActivityCategory } from './types';

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

/** What Settings calls each category, grouped the way the Activity chips are. */
export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  'agent.question': 'An agent asks a question',
  'agent.plan': 'An agent has a plan to approve',
  'agent.approval': 'An agent needs approval',
  'agent.turn': 'An agent finished its turn',
  'agent.turns-missed': 'Turns finished while you were away',
  'agent.failed': 'An agent stopped with an error',
  'agent.interrupted': 'An agent was interrupted',
  'agent.limited': 'An agent hit a usage limit',
  'agent.report': "Vera's reports on your items",
  'pr.review': 'A review on your PR',
  'pr.findings': 'Claude findings on your PR',
  'pr.review-request': 'Your review is requested',
  'pr.checks-failed': 'Checks fail on your PR',
  'pr.checks-passed': 'Checks pass again',
  'pr.ready': 'Your PR is ready to merge',
  'pr.conflict': 'Your PR has a merge conflict',
  'pr.merged': 'Your PR was merged',
  'pr.closed': 'Your PR was closed',
  'ci.group-grew': 'A shared CI failure nobody owns',
  'ci.owner-stale': 'A CI investigation went quiet',
  'ci.fix-merged': 'A CI failure fix was merged',
  'ci.seen-after-fix': 'A fixed CI failure came back',
  'ci.resolved': 'A CI failure was resolved',
  'workstream.unblocked': 'A workstream was unblocked',
  'workstream.invalidated': 'A workstream outcome stopped holding',
  'workstream.reopened': 'A completed workstream changed',
  'workstream.conflict': 'A workstream changed on another machine',
  'workstream.proposal': 'Agent proposals for a workstream',
  'workstream.ready': 'A workstream is ready to complete',
  'deploy.pr': 'Your PR head was deployed',
  'deploy.reached': 'Your merged PR reached an environment',
  'deploy.failed': 'A deploy carrying your PR failed',
  'ado.assigned': 'An item was assigned to you',
  'ado.state': 'Someone moved your item',
  'ado.comment': 'A comment on your item',
  'activity.rollup': 'Older updates folded together',
};
