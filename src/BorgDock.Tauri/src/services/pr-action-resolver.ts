import { isMyPr, isWaitingOnMe } from '@/services/pr-grouping';
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
  /**
   * PR is ready to merge: checks green, approved, no conflicts, not draft —
   * the same conditions that drive a 100% merge score. Surfaced as the primary
   * action regardless of authorship: GitHub permits anyone with write access
   * to merge, so the button shouldn't gate on `own`.
   */
  ready: boolean;
}

/**
 * Pick the most-likely primary action for a PR card.
 * Mirrors design's primaryFor() in pr-actions.jsx — see chat1.md.
 */
export function primaryFor(shape: PrActionShape): PrActionId {
  if (shape.failing) return 'rerun';
  if (shape.ready) return 'merge';
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
  const approved = prw.pullRequest.reviewStatus === 'approved';
  const ready =
    prw.overallStatus === 'green' &&
    approved &&
    prw.pullRequest.mergeable !== false &&
    !prw.pullRequest.isDraft;
  return {
    failing: prw.overallStatus === 'red',
    approved,
    reviewing,
    own: isMine,
    ready,
  };
}

/**
 * The one action a Workbench row (and a Focus card's primary button) offers
 * without opening the PR: Review or Merge, else nothing. `primaryFor`, with
 * one change: a review still requested from me wins over Merge, so a ready
 * PR that waits on my review asks for the review first, on the row and on
 * the card alike.
 */
export function workbenchPrimaryAction(
  prWithChecks: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): 'review' | 'merge' | null {
  const pr = prWithChecks.pullRequest;
  if (pr.state !== 'open' || pr.mergedAt) return null;
  const reviewing = isWaitingOnMe(prWithChecks, username, teams);
  const shape = shapeFromPrWithChecks(prWithChecks, isMyPr(prWithChecks, username), reviewing);
  const primary = primaryFor(shape);
  if (primary === 'merge' && reviewing) return 'review';
  return primary === 'review' || primary === 'merge' ? primary : null;
}
