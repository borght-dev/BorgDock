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
import type { PullRequestWithChecks } from '@/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { HoverActionPillBar } from './HoverActionPillBar';
import { type PrCardData, type PrCardDensity, PrCardView } from './PrCardView';
import { PrContextMenu } from './PrContextMenu';
import { T3SessionStrip } from './T3SessionStrip';

interface PrCardContainerProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
  focusMode?: boolean;
  priorityFactors?: PriorityFactor[];
  density?: PrCardDensity;
}

function mapToPrCardData(
  prw: PullRequestWithChecks,
  isMyPr: boolean,
  worktreeSlot?: string,
): PrCardData {
  const pr = prw.pullRequest;
  const failedCount = prw.failedCheckNames.length;
  const pendingCount = prw.pendingCheckNames.length;
  const totalChecks = prw.totalCheckCount;
  const relevant = totalChecks - prw.skippedCount;
  const statusLabel =
    failedCount > 0
      ? `${failedCount} failing`
      : pendingCount > 0
        ? 'in progress'
        : totalChecks > 0
          ? `${prw.passedCount}/${relevant} passing`
          : '';
  const reviewState =
    pr.reviewStatus === 'approved'
      ? 'approved'
      : pr.reviewStatus === 'changesRequested'
        ? 'changes'
        : pr.reviewStatus === 'commented'
          ? 'commented'
          : pr.reviewStatus === 'pending'
            ? 'pending'
            : 'none';
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine: isMyPr,
    status: prw.overallStatus,
    statusLabel,
    reviewState,
    isDraft: pr.isDraft,
    isMerged: !!pr.mergedAt,
    isClosed: !!pr.closedAt,
    hasConflict: pr.mergeable === false,
    branch: pr.headRef,
    baseBranch: pr.baseRef,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changedFiles ?? 0,
    commitCount: pr.commitCount ?? 0,
    commentCount: pr.commentCount,
    labels: pr.labels,
    worktreeSlot,
  };
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
  density = 'normal',
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
    () => mapToPrCardData(prWithChecks, isMyPr, worktreeMatch?.slotName),
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
      {/* Wrapper preserves the data-pr-card hook used by useKeyboardNav and `group` for hover-only action bar reveal. */}
      <div data-pr-card="" className="group relative">
        {focusMode && priorityFactors && priorityFactors.length > 0 && (
          <div className="mb-1 px-1">
            <PriorityReasonLabel factors={priorityFactors} />
          </div>
        )}
        <PrCardView
          density={density}
          pr={cardData}
          score={mergeScore}
          onClick={handleCardClick}
          onContextMenu={actions.handleContextMenu}
          active={isFocused}
          isFocused={isSelected}
        />
        {/* Variant A — compact hover-reveal pill bar anchored bottom-right.
            Heavy actions (Bypass, Close, Mark Draft, Copy Errors, Fix/Monitor with
            Claude) live on the right-click context menu via the More button.
            When the PR has merge conflicts, a purple "Resolve Conflicts" button
            is injected at the start of the bar instead of being rendered as a
            separate always-visible block below the card. */}
        {isOpen && (
          <div
            className="absolute right-3 bottom-2.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            // style: pointer-events toggled inline so the bar can't intercept clicks while invisible
            style={{ pointerEvents: undefined }}
          >
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
        {workItemIds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {workItemIds.map((id) => (
              <LinkedWorkItemBadge key={id} workItemId={id} compact />
            ))}
          </div>
        )}
        <T3SessionStrip pr={pr} />
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
