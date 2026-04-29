import type { PullRequestWithChecks } from '@/types';

export type PrActionId = 'rerun' | 'merge' | 'review' | 'checkout' | 'open';
export type PrActionTone = 'success' | 'warning' | 'primary' | 'default';

export interface PrActionShape {
  /** PR has a failing required check. */
  failing: boolean;
  /** PR has been approved. */
  approved: boolean;
  /** Current user is requested as a reviewer (review pending). */
  reviewing: boolean;
  /** Current user is the PR author. */
  own: boolean;
}

/**
 * Pick the most-likely primary action for a PR card.
 * Mirrors design's primaryFor() in pr-actions.jsx — see chat1.md.
 */
export function primaryFor(shape: PrActionShape): PrActionId {
  if (shape.failing) return 'rerun';
  if (shape.approved && shape.own) return 'merge';
  if (shape.reviewing) return 'review';
  if (shape.own) return 'checkout';
  return 'open';
}

export function primaryTone(action: PrActionId): PrActionTone {
  if (action === 'rerun') return 'warning';
  if (action === 'merge') return 'success';
  if (action === 'review') return 'primary';
  return 'default';
}

export const ACTION_LABEL: Record<PrActionId, string> = {
  rerun: 'Re-run',
  merge: 'Merge',
  review: 'Review',
  checkout: 'Checkout',
  open: 'Open',
};

export function shapeFromPrWithChecks(
  prw: PullRequestWithChecks,
  isMine: boolean,
  reviewing: boolean,
): PrActionShape {
  return {
    failing: prw.overallStatus === 'red',
    approved: prw.pullRequest.reviewStatus === 'approved',
    reviewing,
    own: isMine,
  };
}
