import clsx from 'clsx';
import type { PullRequestWithChecks } from '@/types';
import { useUiStore } from '@/stores/ui-store';
import { usePrStore } from '@/stores/pr-store';
import { StatusIndicator } from './StatusIndicator';
import { MergeScoreBadge } from './MergeScoreBadge';
import { LabelBadge } from './LabelBadge';

interface PullRequestCardProps {
  prWithChecks: PullRequestWithChecks;
}

function reviewStatusLabel(status: string): string {
  switch (status) {
    case 'approved': return 'Approved';
    case 'changesRequested': return 'Changes Requested';
    case 'pending': return 'Review Pending';
    case 'commented': return 'Commented';
    default: return '';
  }
}

function reviewStatusColor(status: string): string {
  switch (status) {
    case 'approved': return 'var(--color-review-approved)';
    case 'changesRequested': return 'var(--color-review-changes-requested)';
    case 'pending': return 'var(--color-review-required)';
    case 'commented': return 'var(--color-review-commented)';
    default: return 'var(--color-text-muted)';
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

export function PullRequestCard({ prWithChecks }: PullRequestCardProps) {
  const { pullRequest: pr, overallStatus, passedCount, checks } = prWithChecks;
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const username = usePrStore((s) => s.username);

  const isMyPr =
    username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const isSelected = selectedPrNumber === pr.number;
  const totalChecks = checks.length;
  const mergeScore = computeMergeScore(prWithChecks);

  return (
    <button
      onClick={() => selectPr(pr.number)}
      className={clsx(
        'group flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
        isSelected
          ? 'bg-[var(--color-selected-row-bg)] border-[var(--color-accent)]'
          : isMyPr
            ? 'bg-[var(--color-card-background)] border-[var(--color-card-border-my-pr)] hover:bg-[var(--color-surface-hover)]'
            : 'bg-[var(--color-card-background)] border-[var(--color-card-border)] hover:bg-[var(--color-surface-hover)]',
        'shadow-sm',
      )}
    >
      {/* Status dot */}
      <div className="mt-1.5">
        <StatusIndicator status={overallStatus} />
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
          <span className="truncate font-mono text-[var(--color-text-muted)]">
            {pr.headRef}
          </span>
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
  );
}
