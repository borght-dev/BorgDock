import { memo, useMemo } from 'react';
import { PriorityReasonLabel } from '@/components/focus/PriorityReasonLabel';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { Button } from '@/components/shared/primitives';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { computeMergeScore } from '@/services/merge-score';
import type { PriorityFactor } from '@/services/priority-scoring';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ActionButton } from './ActionButton';
import { PRCard, type PRCardData } from './PRCard';
import { PrContextMenu } from './PrContextMenu';
import { ExpandedContent } from './PullRequestExpandedContent';

interface PullRequestCardProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
  focusMode?: boolean;
  priorityFactors?: PriorityFactor[];
}

function mapToPRCardData(
  prw: PullRequestWithChecks,
  isMyPr: boolean,
  worktreeSlot?: string,
): PRCardData {
  const pr = prw.pullRequest;
  const failedCount = prw.failedCheckNames.length;
  const pendingCount = prw.pendingCheckNames.length;
  const totalChecks = prw.checks.length;
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

interface HoverActionBarProps {
  prWithChecks: PullRequestWithChecks;
  actions: ReturnType<typeof usePrCardActions>;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function HoverActionBar({
  prWithChecks,
  actions,
  isExpanded,
  onToggleExpand,
}: HoverActionBarProps) {
  const { pullRequest: pr, overallStatus, failedCheckNames } = prWithChecks;
  const isOpen = pr.state === 'open';
  const canMerge = isOpen && !pr.isDraft && overallStatus === 'green';

  return (
    <>
      {overallStatus === 'red' && actions.failedCheck && (
        <ActionButton
          label="Re-run"
          icon={'\u21BB'}
          onClick={actions.handleRerun}
          variant="accent"
        />
      )}
      {overallStatus === 'red' && (
        <ActionButton
          label="Fix"
          icon={'\u2726'}
          onClick={actions.handleFix}
          variant="purple"
        />
      )}
      <ActionButton
        label="Monitor"
        icon={'\u25B6'}
        onClick={actions.handleMonitor}
        variant="purple"
      />
      {failedCheckNames.length > 0 && (
        <ActionButton
          label="Copy"
          icon={'\uD83D\uDCCB'}
          onClick={actions.handleCopyErrors}
          variant="default"
        />
      )}
      <ActionButton
        label="Open in Browser"
        onClick={actions.handleOpenInBrowser}
        variant="default"
      />
      <ActionButton label="Copy Branch" onClick={actions.handleCopyBranch} variant="default" />
      {actions.repoPath && (
        <ActionButton label="Checkout" onClick={actions.handleCheckout} variant="default" />
      )}
      {isOpen && (
        <ActionButton
          label={pr.isDraft ? 'Mark Ready' : 'Mark Draft'}
          onClick={actions.handleToggleDraft}
          variant="draft"
        />
      )}
      {canMerge && (
        <ActionButton label="Merge" onClick={actions.handleMerge} variant="success" />
      )}
      {isOpen && (
        <ActionButton
          label="Bypass Merge"
          onClick={actions.handleBypassMerge}
          variant="danger"
        />
      )}
      {isOpen && (
        <ActionButton label="Close PR" onClick={actions.handleClose} variant="danger" />
      )}
      <Button
        variant="ghost"
        size="sm"
        data-expand-toggle=""
        title={isExpanded ? 'Collapse' : 'Expand'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {isExpanded ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}
        </svg>
      </Button>
    </>
  );
}

export const PullRequestCard = memo(function PullRequestCard({
  prWithChecks,
  isFocused,
  focusMode,
  priorityFactors,
}: PullRequestCardProps) {
  const { pullRequest: pr } = prWithChecks;
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const togglePrExpanded = useUiStore((s) => s.togglePrExpanded);
  const isExpanded = useUiStore((s) => s.expandedPrNumbers.has(pr.number));
  const username = usePrStore((s) => s.username);
  const worktreeBranchMap = useUiStore((s) => s.worktreeBranchMap);

  const actions = usePrCardActions(prWithChecks);

  const isMyPr = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const worktreeMatch = worktreeBranchMap.get(pr.headRef.toLowerCase());
  const isSelected = selectedPrNumber === pr.number;
  const mergeScore = useMemo(() => computeMergeScore(prWithChecks), [prWithChecks]);
  const workItemIds = useMemo(() => detectWorkItemIds(pr), [pr]);

  const cardData = useMemo(
    () => mapToPRCardData(prWithChecks, isMyPr, worktreeMatch?.slotName),
    [prWithChecks, isMyPr, worktreeMatch?.slotName],
  );

  return (
    <>
      {/* Wrapper preserves the data-pr-card hook used by useKeyboardNav and `group` for hover-only action bar reveal. */}
      <div data-pr-card="" className="group">
        {focusMode && priorityFactors && priorityFactors.length > 0 && (
          <div className="mb-1 px-1">
            <PriorityReasonLabel factors={priorityFactors} />
          </div>
        )}
        <PRCard
          density="normal"
          pr={cardData}
          score={mergeScore}
          onClick={() => selectPr(pr.number)}
          onContextMenu={actions.handleContextMenu}
          active={isFocused}
          isFocused={isSelected}
        />
        {pr.mergeable === false && (
          <div className="mt-2">
            <ActionButton
              label="Resolve Conflicts"
              icon={'\u2726'}
              onClick={actions.handleResolveConflicts}
              variant="accent"
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <HoverActionBar
            prWithChecks={prWithChecks}
            actions={actions}
            isExpanded={isExpanded}
            onToggleExpand={() => togglePrExpanded(pr.number)}
          />
        </div>
        {workItemIds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {workItemIds.map((id) => (
              <LinkedWorkItemBadge key={id} workItemId={id} compact />
            ))}
          </div>
        )}
        {isExpanded && (
          <div className="px-2">
            <ExpandedContent prWithChecks={prWithChecks} />
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
