import { memo, useCallback, useMemo } from 'react';
import { PriorityReasonLabel } from '@/components/focus/PriorityReasonLabel';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { computeMergeScore } from '@/services/merge-score';
import { type PrActionId, primaryFor, shapeFromPrWithChecks } from '@/services/pr-action-resolver';
import type { PriorityFactor } from '@/services/priority-scoring';
import { openPrDetail } from '@/services/windows';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { HoverActionPillBar } from './HoverActionPillBar';
import { PrContextMenu } from './PrContextMenu';
import { PrRow } from './PrRow';
import { toPrCardData } from './pr-card-data';
import { T3SessionStrip } from './T3SessionStrip';

interface PrCardContainerProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
  focusMode?: boolean;
  priorityFactors?: PriorityFactor[];
  density?: PrDensity;
  /** Extra inline badge in the row's meta line (e.g. review SLA wait time). */
  badge?: React.ReactNode;
  /** Show the repo name next to the author. */
  showRepo?: boolean;
}

function dispatchPrimaryAction(
  action: PrActionId,
  e: React.MouseEvent,
  actions: ReturnType<typeof usePrCardActions>,
) {
  switch (action) {
    case 'rerun':
      return actions.handleRerun(e);
    case 'merge':
      return actions.handleMerge(e);
    case 'review':
    case 'open':
      return actions.handleOpenInBrowser(e);
    case 'checkout':
      return actions.handleCheckout(e);
  }
}

export const PrCardContainer = memo(function PrCardContainer({
  prWithChecks,
  isFocused,
  focusMode,
  priorityFactors,
  density = 'comfortable',
  badge,
  showRepo,
}: PrCardContainerProps) {
  const { pullRequest: pr } = prWithChecks;
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const username = usePrStore((s) => s.username);
  const worktreeBranchMap = useUiStore((s) => s.worktreeBranchMap);

  const actions = usePrCardActions(prWithChecks);

  const isMyPr = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const worktreeMatch = worktreeBranchMap.get(pr.headRef.toLowerCase());
  const isSelected = selectedPrNumber === pr.number;
  const mergeScore = useMemo(() => computeMergeScore(prWithChecks), [prWithChecks]);
  const workItemIds = useMemo(() => detectWorkItemIds(pr), [pr]);

  const cardData = useMemo(
    () => toPrCardData(prWithChecks, isMyPr, worktreeMatch?.slotName),
    [prWithChecks, isMyPr, worktreeMatch?.slotName],
  );

  // Whole-card click opens the pop-out detail window. Inner action buttons
  // either stop propagation themselves (HoverActionPillBar, expand toggle,
  // confirm dialogs) or carry a `data-pr-card-action` ancestor that this
  // handler skips via closest(). Falls back to no-op on click of inner action.
  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('[data-pr-card-action]')) return;
      void openPrDetail({
        owner: pr.repoOwner,
        repo: pr.repoName,
        number: pr.number,
      });
    },
    [pr.number, pr.repoOwner, pr.repoName],
  );

  const reviewing = pr.reviewStatus === 'pending';
  const primary = primaryFor(shapeFromPrWithChecks(prWithChecks, isMyPr, reviewing));
  const isOpen = pr.state === 'open';

  return (
    <>
      {/* data-pr-card is the useKeyboardNav hook; bd-pr-row-wrap drives the hover action bar reveal. */}
      <div data-pr-card="" className="bd-pr-row-wrap">
        <PrRow
          density={density}
          pr={cardData}
          score={mergeScore}
          onClick={handleCardClick}
          onContextMenu={actions.handleContextMenu}
          active={isFocused}
          isFocused={isSelected}
          showRepo={showRepo}
          extras={
            <>
              {focusMode && priorityFactors && priorityFactors.length > 0 && (
                <PriorityReasonLabel factors={priorityFactors} />
              )}
              {workItemIds.map((id) => (
                <LinkedWorkItemBadge key={id} workItemId={id} compact />
              ))}
              {badge}
              <T3SessionStrip pr={pr} inline />
            </>
          }
        />
        {/* Variant A — hover-reveal pill bar floating over the row's right side.
            Heavy actions (Bypass, Close, Mark Draft, Copy Errors, Fix/Monitor with
            Claude) live on the right-click context menu via the More button.
            When the PR has merge conflicts, a purple "Resolve Conflicts" button
            is injected at the start of the bar instead of being rendered as a
            separate always-visible block below the card. */}
        {isOpen && (
          <div className="bd-pr-item__actions" data-density={density}>
            <HoverActionPillBar
              primary={primary}
              onPrimary={(e) => dispatchPrimaryAction(primary, e, actions)}
              onCheckout={actions.repoPath ? actions.handleCheckout : undefined}
              onReview={actions.handleOpenInBrowser}
              onResolveConflicts={
                pr.mergeable === false ? actions.handleResolveConflicts : undefined
              }
              onMore={(e) => {
                actions.setContextMenu({ x: e.clientX, y: e.clientY });
              }}
            />
          </div>
        )}
      </div>

      {/* Context menu */}
      {actions.contextMenu && (
        <PrContextMenu
          pr={prWithChecks}
          position={actions.contextMenu}
          onClose={() => actions.setContextMenu(null)}
          onConfirmAction={actions.setConfirmAction}
        />
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={actions.confirmAction === 'close'}
        title="Close pull request?"
        message={`This will close PR #${pr.number} without merging. You can reopen it later.`}
        confirmLabel="Close PR"
        variant="danger"
        onConfirm={actions.executeClose}
        onCancel={() => actions.setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={actions.confirmAction === 'bypass'}
        title="Bypass merge?"
        message={`This will merge PR #${pr.number} using admin privileges, bypassing branch protection rules.`}
        confirmLabel="Bypass Merge"
        variant="danger"
        onConfirm={actions.executeBypassMerge}
        onCancel={() => actions.setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={actions.confirmAction === 'draft'}
        title={pr.isDraft ? 'Mark as ready for review?' : 'Convert to draft?'}
        message={
          pr.isDraft
            ? `This will mark PR #${pr.number} as ready for review and request reviewers.`
            : `This will convert PR #${pr.number} to a draft. Reviewers will not be requested.`
        }
        confirmLabel={pr.isDraft ? 'Mark Ready' : 'Convert to Draft'}
        variant="default"
        onConfirm={actions.executeToggleDraft}
        onCancel={() => actions.setConfirmAction(null)}
      />
    </>
  );
});
