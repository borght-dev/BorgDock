import clsx from 'clsx';
import { memo, useMemo } from 'react';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { computeMergeScore } from '@/services/merge-score';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import type { PriorityFactor } from '@/services/priority-scoring';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { PriorityReasonLabel } from '@/components/focus/PriorityReasonLabel';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { ActionButton } from './ActionButton';
import { ExpandedContent } from './PullRequestExpandedContent';
import { LabelBadge } from './LabelBadge';
import { MergeScoreBadge } from './MergeScoreBadge';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PrContextMenu } from './PrContextMenu';
import { StatusIndicator } from './StatusIndicator';

interface PullRequestCardProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
  focusMode?: boolean;
  priorityFactors?: PriorityFactor[];
}

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

export const PullRequestCard = memo(function PullRequestCard({ prWithChecks, isFocused, focusMode, priorityFactors }: PullRequestCardProps) {
  const { pullRequest: pr, overallStatus, passedCount, checks, failedCheckNames } = prWithChecks;
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
  const totalChecks = checks.length;
  const mergeScore = useMemo(() => computeMergeScore(prWithChecks), [prWithChecks]);
  const workItemIds = useMemo(() => detectWorkItemIds(pr), [pr]);
  const isOpen = pr.state === 'open';
  const canMerge = isOpen && !pr.isDraft && overallStatus === 'green';

  return (
    <>
      <button
        data-pr-card
        onClick={() => selectPr(pr.number)}
        onContextMenu={actions.handleContextMenu}
        className={clsx(
          'group flex w-full items-start gap-3 rounded-lg border p-4 px-5 text-left transition-colors',
          isSelected
            ? 'bg-[var(--color-selected-row-bg)] border-[var(--color-accent)]'
            : isMyPr
              ? 'bg-[var(--color-card-background)] border-[var(--color-card-border-my-pr)] hover:border-[var(--color-text-ghost)]'
              : 'bg-[var(--color-card-background)] border-[var(--color-card-border)] hover:border-[var(--color-text-ghost)]',
          isFocused &&
            'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-background)]',
        )}
      >
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <StatusIndicator status={overallStatus} />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          {/* Focus mode: repo chip + priority reason */}
          {focusMode && (
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                {pr.repoOwner}/{pr.repoName}
              </span>
              {priorityFactors && <PriorityReasonLabel factors={priorityFactors} />}
            </div>
          )}

          {/* Title */}
          <div className="text-sm font-medium leading-snug text-[var(--color-text-primary)]">
            {pr.title}
          </div>

          {/* Meta row: avatar + branch + badges */}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
              style={{ backgroundColor: isMyPr ? '#1D9E75' : '#534AB7' }}
              title={pr.authorLogin}
            >
              {avatarInitials(pr.authorLogin)}
            </span>
            <span className="rounded bg-[var(--color-branch-badge-bg,var(--color-surface-raised))] px-2 py-0.5 font-mono text-xs text-[var(--color-text-secondary)]">
              {pr.headRef}
            </span>
            {worktreeMatch && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono"
                style={{
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-subtle)',
                  borderColor: 'rgba(124, 106, 246, 0.15)',
                }}
                title={`Checked out in ${worktreeMatch.fullPath}`}
              >
                <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 2v12M12 8c0-3-2-4-4-4" />
                </svg>
                {worktreeMatch.slotName}
              </span>
            )}
            {prWithChecks.pendingCheckNames.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--color-warning-badge-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-warning-badge-fg)] border border-[var(--color-warning-badge-border)]">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="animate-spin">
                  <path d="M6 1a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                in progress
              </span>
            )}
            {pr.mergeable === false && (
              <span className="rounded-full bg-[var(--color-error-badge-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]">
                conflicts
              </span>
            )}
            {pr.isDraft && (
              <span className="rounded-full bg-[var(--color-draft-badge-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]">
                draft
              </span>
            )}
            {pr.mergedAt && (
              <span className="rounded-full bg-[var(--color-success-badge-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]">
                merged
              </span>
            )}
            {pr.closedAt && !pr.mergedAt && (
              <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                closed
              </span>
            )}
          </div>

          {/* Labels + Work Item Links */}
          {(pr.labels.length > 0 || workItemIds.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pr.labels.map((label) => (
                <LabelBadge key={label} label={label} />
              ))}
              {workItemIds.map((id) => (
                <LinkedWorkItemBadge key={id} workItemId={id} compact />
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="mt-2.5 flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
            {totalChecks > 0 && (() => {
              const relevant = totalChecks - prWithChecks.skippedCount;
              const failedCount = prWithChecks.failedCheckNames.length;
              const pendingCount = prWithChecks.pendingCheckNames.length;
              return (
                <span
                  className="flex items-center gap-2"
                  title={`${passedCount}/${relevant} checks passed${prWithChecks.skippedCount > 0 ? ` (${prWithChecks.skippedCount} skipped)` : ''}`}
                >
                  <span className="flex h-[4px] w-20 gap-0.5 overflow-hidden rounded-full">
                    {passedCount > 0 && (
                      <span
                        className="h-full rounded-full"
                        style={{ flex: passedCount, background: 'var(--color-status-green)' }}
                      />
                    )}
                    {failedCount > 0 && (
                      <span
                        className="h-full rounded-full"
                        style={{ flex: failedCount, background: 'var(--color-status-red)' }}
                      />
                    )}
                    {pendingCount > 0 && (
                      <span
                        className="h-full rounded-full"
                        style={{ flex: pendingCount, background: 'var(--color-status-yellow)' }}
                      />
                    )}
                    {prWithChecks.skippedCount > 0 && (
                      <span
                        className="h-full rounded-full"
                        style={{ flex: prWithChecks.skippedCount, background: 'var(--color-status-gray)', opacity: 0.3 }}
                      />
                    )}
                  </span>
                  <span className="font-mono tabular-nums">{passedCount}/{relevant}</span>
                </span>
              );
            })()}
            {(pr.additions > 0 || pr.deletions > 0) && (
              <span className="font-mono tabular-nums">
                <span className="font-medium text-[var(--color-status-green)]">+{(pr.additions ?? 0).toLocaleString()}</span>
                <span className="text-[var(--color-text-ghost)]"> </span>
                <span className="font-medium text-[var(--color-status-red)]">{'\u2212'}{(pr.deletions ?? 0).toLocaleString()}</span>
              </span>
            )}
            {pr.commitCount > 0 && (
              <span className="tabular-nums">
                {pr.commitCount}c
                {pr.changedFiles > 0 && <>{' \u00B7 '}{pr.changedFiles} files</>}
              </span>
            )}
            {pr.commentCount > 0 && (
              <span className="tabular-nums" title="Comments">
                {pr.commentCount}{'\uD83D\uDCAC'}
              </span>
            )}
          </div>

          {/* Conflict resolve button - always visible when conflicts */}
          {pr.mergeable === false && (
            <div className="mt-2">
              <ActionButton label="Resolve Conflicts" icon={'\u2726'} onClick={actions.handleResolveConflicts} variant="accent" />
            </div>
          )}

          {/* Action buttons - visible on hover */}
          <div className="mt-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {overallStatus === 'red' && actions.failedCheck && (
              <ActionButton label="Re-run" icon={'\u21BB'} onClick={actions.handleRerun} variant="accent" />
            )}
            {overallStatus === 'red' && (
              <ActionButton label="Fix" icon={'\u2726'} onClick={actions.handleFix} variant="purple" />
            )}
            <ActionButton label="Monitor" icon={'\u25B6'} onClick={actions.handleMonitor} variant="purple" />
            {failedCheckNames.length > 0 && (
              <ActionButton label="Copy" icon={'\uD83D\uDCCB'} onClick={actions.handleCopyErrors} variant="default" />
            )}
            <ActionButton label="Open in Browser" onClick={actions.handleOpenInBrowser} variant="default" />
            <ActionButton label="Copy Branch" onClick={actions.handleCopyBranch} variant="default" />
            {actions.repoPath && (
              <ActionButton label="Checkout" onClick={actions.handleCheckout} variant="default" />
            )}
            {isOpen && (
              <ActionButton label={pr.isDraft ? 'Mark Ready' : 'Mark Draft'} onClick={actions.handleToggleDraft} variant="draft" />
            )}
            {canMerge && (
              <ActionButton label="Merge" onClick={actions.handleMerge} variant="success" />
            )}
            {isOpen && (
              <ActionButton label="Bypass Merge" onClick={actions.handleBypassMerge} variant="danger" />
            )}
            {isOpen && (
              <ActionButton label="Close PR" onClick={actions.handleClose} variant="danger" />
            )}
            <button
              data-expand-toggle
              onClick={(e) => {
                e.stopPropagation();
                togglePrExpanded(pr.number);
              }}
              className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold cursor-pointer border-[var(--color-subtle-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
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
            </button>
          </div>

          {/* Inline expansion */}
          {isExpanded && <ExpandedContent prWithChecks={prWithChecks} />}
        </div>

        {/* Right column: PR number + merge score */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">#{pr.number}</span>
          <MergeScoreBadge score={mergeScore} />
        </div>
      </button>

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
