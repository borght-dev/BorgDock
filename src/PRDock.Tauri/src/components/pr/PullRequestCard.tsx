import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { rerunWorkflow } from '@/services/github/checks';
import { getClient } from '@/services/github/singleton';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { LabelBadge } from './LabelBadge';
import { MergeScoreBadge } from './MergeScoreBadge';
import { MultiSignalIndicator } from './MultiSignalIndicator';
import { PrContextMenu } from './PrContextMenu';
import { StatusIndicator } from './StatusIndicator';

interface PullRequestCardProps {
  prWithChecks: PullRequestWithChecks;
  isFocused?: boolean;
}

function reviewStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'changesRequested':
      return 'Changes Requested';
    case 'pending':
      return 'Review Pending';
    case 'commented':
      return 'Commented';
    default:
      return '';
  }
}

function reviewStatusColor(status: string): string {
  switch (status) {
    case 'approved':
      return 'var(--color-review-approved)';
    case 'changesRequested':
      return 'var(--color-review-changes-requested)';
    case 'pending':
      return 'var(--color-review-required)';
    case 'commented':
      return 'var(--color-review-commented)';
    default:
      return 'var(--color-text-muted)';
  }
}

function computeMergeScore(pr: PullRequestWithChecks): number {
  let score = 0;
  const total = pr.checks.length;

  // Checks component (40%)
  if (total > 0) {
    score += (pr.passedCount / total) * 40;
  } else {
    score += 40; // No checks = full marks
  }

  // Review component (40%)
  if (pr.pullRequest.reviewStatus === 'approved') score += 40;
  else if (pr.pullRequest.reviewStatus === 'commented') score += 20;
  else if (pr.pullRequest.reviewStatus === 'pending') score += 10;

  // No conflicts (20%)
  if (pr.pullRequest.mergeable !== false) score += 20;

  return Math.round(score);
}

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-subtle-border)] transition-colors"
      title={label}
    >
      <span>{icon}</span>
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
  const settings = useSettingsStore((s) => s.settings);
  const { fixWithClaude, monitorPr } = useClaudeActions();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isMyPr = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const isSelected = selectedPrNumber === pr.number;
  const totalChecks = checks.length;
  const mergeScore = computeMergeScore(prWithChecks);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

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
        console.error('Failed to rerun checks:', err),
      );
    },
    [failedCheck, pr.repoOwner, pr.repoName],
  );

  const handleFix = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const firstFailedName = failedCheckNames[0] ?? 'unknown';
      fixWithClaude(prWithChecks, firstFailedName, [], [], '').catch((err) =>
        console.error('Fix with Claude failed:', err),
      );
    },
    [prWithChecks, failedCheckNames, fixWithClaude],
  );

  const handleMonitor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      monitorPr(prWithChecks).catch((err) => console.error('Monitor with Claude failed:', err));
    },
    [prWithChecks, monitorPr],
  );

  const handleCopyErrors = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (failedCheckNames.length === 0) return;
      const markdown = [
        `## Failed checks for PR #${pr.number}`,
        '',
        ...failedCheckNames.map((name: string) => `- ${name}`),
      ].join('\n');
      writeText(markdown).catch((err) => console.error('Failed to copy errors:', err));
    },
    [failedCheckNames, pr.number],
  );

  return (
    <>
      <button
        data-pr-card
        onClick={() => selectPr(pr.number)}
        onContextMenu={handleContextMenu}
        className={clsx(
          'group flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
          isSelected
            ? 'bg-[var(--color-selected-row-bg)] border-[var(--color-accent)]'
            : isMyPr
              ? 'bg-[var(--color-card-background)] border-[var(--color-card-border-my-pr)] hover:bg-[var(--color-surface-hover)]'
              : 'bg-[var(--color-card-background)] border-[var(--color-card-border)] hover:bg-[var(--color-surface-hover)]',
          isFocused &&
            'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-background)]',
          'shadow-sm',
        )}
      >
        {/* Status indicator */}
        <div className="mt-1.5">
          {settings.ui.indicatorStyle === 'SegmentRing' ||
          settings.ui.indicatorStyle === 'SignalDots' ? (
            <MultiSignalIndicator pr={prWithChecks} size={20} style={settings.ui.indicatorStyle} />
          ) : (
            <StatusIndicator status={overallStatus} />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex items-start gap-1.5">
            <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">
              {pr.title}
            </span>
            <span className="shrink-0 rounded bg-[var(--color-pr-badge-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-pr-badge-fg)]">
              #{pr.number}
            </span>
            {pr.isDraft && (
              <span className="shrink-0 rounded bg-[var(--color-draft-badge-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]">
                Draft
              </span>
            )}
            {pr.mergedAt && (
              <span className="shrink-0 rounded bg-[var(--color-success-badge-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]">
                Merged
              </span>
            )}
            {pr.closedAt && !pr.mergedAt && (
              <span className="shrink-0 rounded bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                Closed
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
            <span className="truncate">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[7px] font-bold text-[var(--color-avatar-text)]"
              title={pr.authorLogin}
            >
              {avatarInitials(pr.authorLogin)}
            </span>
            <span className="truncate font-mono text-[var(--color-text-muted)]">{pr.headRef}</span>
          </div>

          {/* Labels + check summary */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {pr.labels.map((label) => (
              <LabelBadge key={label} label={label} />
            ))}
            {totalChecks > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {passedCount}/{totalChecks} checks passed
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
            {pr.commentCount > 0 && (
              <span title="Comments">
                {'\uD83D\uDCAC'} {pr.commentCount}
              </span>
            )}
            {(pr.additions > 0 || pr.deletions > 0) && (
              <span>
                <span className="text-green-500">+{pr.additions}</span>{' '}
                <span className="text-red-500">-{pr.deletions}</span>
              </span>
            )}
            {pr.commitCount > 0 && (
              <span title="Commits">
                {pr.commitCount} commit{pr.commitCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Action buttons - visible on hover */}
          <div className="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {overallStatus === 'red' && (
              <ActionButton label="Re-run" icon={'\u21BB'} onClick={handleRerun} />
            )}
            {overallStatus === 'red' && (
              <ActionButton label="Fix" icon={'\u26A1'} onClick={handleFix} />
            )}
            <ActionButton label="Monitor" icon={'\u25B6'} onClick={handleMonitor} />
            {overallStatus === 'red' && (
              <ActionButton label="Copy" icon={'\uD83D\uDCCB'} onClick={handleCopyErrors} />
            )}
            <button
              data-expand-toggle
              onClick={(e) => {
                e.stopPropagation();
                togglePrExpanded(pr.number);
              }}
              className="flex items-center rounded px-1 py-0.5 text-[9px] text-[var(--color-text-muted)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-subtle-border)] transition-colors"
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
          {isExpanded && (
            <div className="border-t border-[var(--color-separator)] pt-2 mt-2 space-y-2">
              <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                {pr.headRef} {'\u2192'} {pr.baseRef}
              </div>
              {pr.body && (
                <div className="text-[11px] text-[var(--color-text-secondary)] line-clamp-4">
                  {pr.body}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side: review status + merge score */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {pr.reviewStatus !== 'none' && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                color: reviewStatusColor(pr.reviewStatus),
                backgroundColor: `color-mix(in srgb, ${reviewStatusColor(pr.reviewStatus)} 10%, transparent)`,
              }}
            >
              {reviewStatusLabel(pr.reviewStatus)}
            </span>
          )}
          <MergeScoreBadge score={mergeScore} />
        </div>
      </button>

      {/* Context menu */}
      {contextMenu && (
        <PrContextMenu
          pr={prWithChecks}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
