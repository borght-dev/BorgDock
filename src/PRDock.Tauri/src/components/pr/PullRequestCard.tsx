import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { MergeReadinessChecklist } from '@/components/pr-detail/MergeReadinessChecklist';
import { rerunWorkflow } from '@/services/github/checks';
import { bypassMergePullRequest, closePullRequest, mergePullRequest, toggleDraft } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { LabelBadge } from './LabelBadge';
import { MergeScoreBadge } from './MergeScoreBadge';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PrContextMenu } from './PrContextMenu';
import { StatusIndicator } from './StatusIndicator';

interface PullRequestCardProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
}

function computeMergeScore(pr: PullRequestWithChecks): number {
  let score = 0;
  const relevant = pr.checks.length - pr.skippedCount;

  // CI checks (25%)
  if (relevant > 0) {
    score += (pr.passedCount / relevant) * 25;
  } else {
    score += 25; // No checks = full marks
  }

  // Approvals (25%)
  if (pr.pullRequest.reviewStatus === 'approved') score += 25;
  else if (pr.pullRequest.reviewStatus === 'commented') score += 10;
  else if (pr.pullRequest.reviewStatus === 'pending') score += 5;

  // No conflicts (25%)
  if (pr.pullRequest.mergeable !== false) score += 25;

  // Not draft (25%)
  if (!pr.pullRequest.isDraft) score += 25;

  return Math.round(score);
}

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

function ExpandedContent({
  prWithChecks,
}: {
  prWithChecks: PullRequestWithChecks;
}) {
  const pr = prWithChecks.pullRequest;

  return (
    <div
      className="border-t border-[var(--color-separator)] mt-4 pt-4 space-y-4 -mx-5 -mb-4 px-5 pb-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Branch flow */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-primary)]">
          {pr.headRef}
        </span>
        <span className="text-[var(--color-text-muted)]">{'\u2192'}</span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2 py-0.5 font-mono text-[var(--color-text-primary)]">
          {pr.baseRef}
        </span>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1 text-[var(--color-text-secondary)]">
          <strong className="font-medium text-[var(--color-text-primary)]">{pr.commitCount}</strong>{' '}
          commit{pr.commitCount !== 1 ? 's' : ''}
        </span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1">
          <span className="font-medium text-[var(--color-status-green)]">
            +{pr.additions.toLocaleString()}
          </span>
          <span className="text-[var(--color-text-muted)]"> / </span>
          <span className="font-medium text-[var(--color-status-red)]">
            {'\u2212'}{pr.deletions.toLocaleString()}
          </span>
        </span>
        <span className="rounded bg-[var(--color-surface-raised)] px-2.5 py-1 text-[var(--color-text-secondary)]">
          <strong className="font-medium text-[var(--color-text-primary)]">{pr.changedFiles}</strong>{' '}
          file{pr.changedFiles !== 1 ? 's' : ''} changed
        </span>
      </div>

      {/* Merge readiness checklist */}
      <MergeReadinessChecklist pr={prWithChecks} />

      {/* PR body - markdown rendered */}
      {pr.body && (
        <div className="border-t border-[var(--color-separator)] pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Summary
          </div>
          <div className="markdown-body max-h-[300px] overflow-y-auto text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{pr.body}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  variant = 'default',
}: {
  label: string;
  icon?: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'accent' | 'purple' | 'success' | 'draft' | 'danger';
}) {
  const variantClasses = {
    default:
      'border-[var(--color-subtle-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]',
    accent:
      'border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]',
    purple:
      'border-[var(--color-purple-border,#6655D4)] text-[var(--color-purple,#9384F7)] hover:bg-[color-mix(in_srgb,var(--color-purple,#9384F7)_10%,transparent)]',
    success:
      'border-[var(--color-success-badge-border)] bg-[var(--color-action-success-bg,color-mix(in_srgb,var(--color-status-green)_15%,transparent))] text-[var(--color-status-green)] hover:opacity-90',
    draft:
      'border-[var(--color-draft-badge-border)] text-[var(--color-draft-badge-fg)] hover:bg-[color-mix(in_srgb,var(--color-draft-badge-fg)_10%,transparent)]',
    danger:
      'border-[var(--color-error-badge-border)] text-[var(--color-error-badge-fg)] hover:bg-[color-mix(in_srgb,var(--color-status-red)_10%,transparent)]',
  };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={clsx(
        'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors',
        variantClasses[variant],
      )}
    >
      {icon && <span className="text-[10px]">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

export function PullRequestCard({ prWithChecks, isFocused }: PullRequestCardProps) {
  const { pullRequest: pr, overallStatus, passedCount, checks, failedCheckNames } = prWithChecks;
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const togglePrExpanded = useUiStore((s) => s.togglePrExpanded);
  const isExpanded = useUiStore((s) => s.expandedPrNumbers.has(pr.number));
  const username = usePrStore((s) => s.username);
  const { fixWithClaude, monitorPr, resolveConflicts } = useClaudeActions();
  const showNotification = useNotificationStore((s) => s.show);
  const settings = useSettingsStore((s) => s.settings);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'close' | 'bypass' | 'draft' | null>(null);

  const isMyPr = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const isSelected = selectedPrNumber === pr.number;
  const totalChecks = checks.length;
  const mergeScore = computeMergeScore(prWithChecks);
  const isOpen = pr.state === 'open';
  const canMerge = isOpen && !pr.isDraft && overallStatus === 'green';
  const repoConfig = settings.repos.find((r) => r.owner === pr.repoOwner && r.name === pr.repoName);
  const repoPath = repoConfig?.worktreeBasePath || '';

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const showError = useCallback(
    (title: string, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showNotification({ title, message, severity: 'error', actions: [] });
    },
    [showNotification],
  );

  // Find a failed check for rerun
  const failedCheck = checks.find(
    (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out',
  );

  const handleRerun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const client = getClient();
      if (!client || !failedCheck) return;
      rerunWorkflow(client, pr.repoOwner, pr.repoName, failedCheck.checkSuiteId).catch((err) =>
        showError('Failed to re-run checks', err),
      );
    },
    [failedCheck, pr.repoOwner, pr.repoName, showError],
  );

  const handleFix = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fixWithClaude(prWithChecks, failedCheckNames.length > 0 ? failedCheckNames : ['unknown'], [], [], '').catch((err) =>
        showError('Fix with Claude failed', err),
      );
    },
    [prWithChecks, failedCheckNames, fixWithClaude, showError],
  );

  const handleMonitor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      monitorPr(prWithChecks).catch((err) => showError('Monitor with Claude failed', err));
    },
    [prWithChecks, monitorPr, showError],
  );

  const handleResolveConflicts = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resolveConflicts(prWithChecks).catch((err) =>
        showError('Resolve conflicts failed', err),
      );
    },
    [prWithChecks, resolveConflicts, showError],
  );

  const handleOpenInBrowser = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openUrl(pr.htmlUrl).catch((err) => showError('Failed to open URL', err));
    },
    [pr.htmlUrl, showError],
  );

  const handleCopyBranch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      writeText(pr.headRef)
        .then(() => showNotification({ title: 'Copied', message: pr.headRef, severity: 'success', actions: [] }))
        .catch((err) => showError('Failed to copy branch', err));
    },
    [pr.headRef, showNotification, showError],
  );

  const handleCheckout = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!repoPath) return;
      invoke('git_fetch', { repoPath, remote: 'origin' })
        .then(() => invoke('git_checkout', { repoPath, branch: pr.headRef }))
        .then(() => showNotification({ title: 'Checked out', message: pr.headRef, severity: 'success', actions: [] }))
        .catch((err) => showError('Checkout failed', err));
    },
    [repoPath, pr.headRef, showNotification, showError],
  );

  const handleToggleDraft = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmAction('draft');
    },
    [],
  );

  const executeToggleDraft = useCallback(() => {
    const client = getClient();
    if (!client) return;
    toggleDraft(client, pr.repoOwner, pr.repoName, pr.number, !pr.isDraft).catch((err) =>
      showError('Failed to toggle draft', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, pr.isDraft, showError]);

  const handleMerge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const client = getClient();
      if (!client) return;
      mergePullRequest(client, pr.repoOwner, pr.repoName, pr.number).catch((err) =>
        showError('Merge failed', err),
      );
    },
    [pr.repoOwner, pr.repoName, pr.number, showError],
  );

  const handleBypassMerge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmAction('bypass');
    },
    [],
  );

  const executeBypassMerge = useCallback(() => {
    bypassMergePullRequest(pr.repoOwner, pr.repoName, pr.number).catch((err) =>
      showError('Bypass merge failed', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, showError]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmAction('close');
    },
    [],
  );

  const executeClose = useCallback(() => {
    const client = getClient();
    if (!client) return;
    closePullRequest(client, pr.repoOwner, pr.repoName, pr.number).catch((err) =>
      showError('Close PR failed', err),
    );
    setConfirmAction(null);
  }, [pr.repoOwner, pr.repoName, pr.number, showError]);

  const handleCopyErrors = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (failedCheckNames.length === 0) return;
      const markdown = [
        `## Failed checks for PR #${pr.number}`,
        '',
        ...failedCheckNames.map((name: string) => `- ${name}`),
      ].join('\n');
      writeText(markdown)
        .then(() =>
          showNotification({
            title: 'Copied to clipboard',
            message: `${failedCheckNames.length} failed check(s) copied`,
            severity: 'success',
            actions: [],
          }),
        )
        .catch((err) => showError('Failed to copy errors', err));
    },
    [failedCheckNames, pr.number, showNotification, showError],
  );

  return (
    <>
      <button
        data-pr-card
        onClick={() => selectPr(pr.number)}
        onContextMenu={handleContextMenu}
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

          {/* Labels */}
          {pr.labels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pr.labels.map((label) => (
                <LabelBadge key={label} label={label} />
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
                <span className="font-medium text-[var(--color-status-green)]">+{pr.additions.toLocaleString()}</span>
                <span className="text-[var(--color-text-ghost)]"> </span>
                <span className="font-medium text-[var(--color-status-red)]">{'\u2212'}{pr.deletions.toLocaleString()}</span>
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
              <ActionButton label="Resolve Conflicts" icon={'\u2726'} onClick={handleResolveConflicts} variant="accent" />
            </div>
          )}

          {/* Action buttons - visible on hover */}
          <div className="mt-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {overallStatus === 'red' && failedCheck && (
              <ActionButton label="Re-run" icon={'\u21BB'} onClick={handleRerun} variant="accent" />
            )}
            {overallStatus === 'red' && (
              <ActionButton label="Fix" icon={'\u2726'} onClick={handleFix} variant="purple" />
            )}
            <ActionButton label="Monitor" icon={'\u25B6'} onClick={handleMonitor} variant="purple" />
            {failedCheckNames.length > 0 && (
              <ActionButton label="Copy" icon={'\uD83D\uDCCB'} onClick={handleCopyErrors} variant="default" />
            )}
            <ActionButton label="Open in Browser" onClick={handleOpenInBrowser} variant="default" />
            <ActionButton label="Copy Branch" onClick={handleCopyBranch} variant="default" />
            {repoPath && (
              <ActionButton label="Checkout" onClick={handleCheckout} variant="default" />
            )}
            {isOpen && (
              <ActionButton label={pr.isDraft ? 'Mark Ready' : 'Mark Draft'} onClick={handleToggleDraft} variant="draft" />
            )}
            {canMerge && (
              <ActionButton label="Merge" onClick={handleMerge} variant="success" />
            )}
            {isOpen && (
              <ActionButton label="Bypass Merge" onClick={handleBypassMerge} variant="danger" />
            )}
            {isOpen && (
              <ActionButton label="Close PR" onClick={handleClose} variant="danger" />
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
      {contextMenu && (
        <PrContextMenu
          pr={prWithChecks}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onConfirmAction={setConfirmAction}
        />
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={confirmAction === 'close'}
        title="Close pull request?"
        message={`This will close PR #${pr.number} without merging. You can reopen it later.`}
        confirmLabel="Close PR"
        variant="danger"
        onConfirm={executeClose}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={confirmAction === 'bypass'}
        title="Bypass merge?"
        message={`This will merge PR #${pr.number} using admin privileges, bypassing branch protection rules.`}
        confirmLabel="Bypass Merge"
        variant="danger"
        onConfirm={executeBypassMerge}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={confirmAction === 'draft'}
        title={pr.isDraft ? 'Mark as ready for review?' : 'Convert to draft?'}
        message={
          pr.isDraft
            ? `This will mark PR #${pr.number} as ready for review and request reviewers.`
            : `This will convert PR #${pr.number} to a draft. Reviewers will not be requested.`
        }
        confirmLabel={pr.isDraft ? 'Mark Ready' : 'Convert to Draft'}
        variant="default"
        onConfirm={executeToggleDraft}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
