import { computeMergeScore } from '@/services/merge-score';
import type { PullRequestWithChecks } from '@/types';

interface MergeReadinessChecklistProps {
  pr: PullRequestWithChecks;
}

type CheckStatus = 'pass' | 'fail' | 'pending' | 'none';

interface ChecklistItem {
  label: string;
  description: string;
  status: CheckStatus;
}

// computeMergeScore imported from @/services/merge-score

function scoreColor(score: number): string {
  if (score < 50) return 'var(--color-status-red)';
  if (score <= 80) return 'var(--color-status-yellow)';
  return 'var(--color-status-green)';
}

function getCheckItems(pr: PullRequestWithChecks): ChecklistItem[] {
  // 1. Checks passed
  let checksStatus: CheckStatus;
  if (pr.checks.length === 0) {
    checksStatus = 'none';
  } else if (pr.failedCheckNames.length > 0) {
    checksStatus = 'fail';
  } else if (pr.pendingCheckNames.length > 0) {
    checksStatus = 'pending';
  } else {
    checksStatus = 'pass';
  }

  const checksDesc =
    pr.checks.length === 0
      ? 'No CI checks configured'
      : pr.skippedCount > 0
        ? `${pr.passedCount}/${pr.checks.length - pr.skippedCount} passed (${pr.skippedCount} skipped)`
        : `${pr.passedCount}/${pr.checks.length} checks passed`;

  // 2. Approved
  let reviewStatus: CheckStatus;
  switch (pr.pullRequest.reviewStatus) {
    case 'approved':
      reviewStatus = 'pass';
      break;
    case 'changesRequested':
      reviewStatus = 'fail';
      break;
    case 'pending':
    case 'commented':
      reviewStatus = 'pending';
      break;
    default:
      reviewStatus = 'none';
  }

  const reviewDesc =
    pr.pullRequest.reviewStatus === 'approved'
      ? 'At least one approval'
      : pr.pullRequest.reviewStatus === 'changesRequested'
        ? 'Changes have been requested'
        : pr.pullRequest.reviewStatus === 'pending'
          ? 'Awaiting reviewer feedback'
          : pr.pullRequest.reviewStatus === 'commented'
            ? 'Review comments pending resolution'
            : 'No reviews yet';

  // 3. No conflicts
  let conflictStatus: CheckStatus;
  if (pr.pullRequest.mergeable === false) {
    conflictStatus = 'fail';
  } else if (pr.pullRequest.mergeable === true) {
    conflictStatus = 'pass';
  } else {
    conflictStatus = 'none';
  }

  const conflictDesc =
    pr.pullRequest.mergeable === false
      ? 'Branch has merge conflicts'
      : pr.pullRequest.mergeable === true
        ? 'Branch is mergeable'
        : 'Mergeability unknown';

  // 4. Not draft
  const draftStatus: CheckStatus = pr.pullRequest.isDraft ? 'pending' : 'pass';
  const draftDesc = pr.pullRequest.isDraft ? 'PR is marked as draft' : 'Ready for review';

  return [
    { label: 'Checks passed', description: checksDesc, status: checksStatus },
    { label: 'Approved', description: reviewDesc, status: reviewStatus },
    { label: 'No conflicts', description: conflictDesc, status: conflictStatus },
    { label: 'Not draft', description: draftDesc, status: draftStatus },
  ];
}

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'pass':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="7" fill="var(--color-status-green)" opacity="0.12" />
          <path
            d="M5 8.5l2 2 4-4"
            stroke="var(--color-status-green)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'fail':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="7" fill="var(--color-status-red)" opacity="0.12" />
          <path
            d="M5.5 5.5l5 5M10.5 5.5l-5 5"
            stroke="var(--color-status-red)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'pending':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="7" fill="var(--color-status-yellow)" opacity="0.12" />
          <circle
            cx="8"
            cy="8"
            r="3"
            stroke="var(--color-status-yellow)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M8 6v2.5l1.5 1"
            stroke="var(--color-status-yellow)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'none':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="7" fill="var(--color-status-gray)" opacity="0.12" />
          <path
            d="M5.5 8h5"
            stroke="var(--color-status-gray)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function ScoreBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = scoreColor(clamped);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      {clamped}
    </span>
  );
}

export function MergeReadinessChecklist({ pr }: MergeReadinessChecklistProps) {
  const items = getCheckItems(pr);
  const score = computeMergeScore(pr);
  const color = scoreColor(score);

  return (
    <div className="rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] overflow-hidden">
      {/* Header with inline score */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
          Merge Readiness
        </span>
        <ScoreBadge score={score} />
      </div>

      {/* Compact progress bar */}
      <div className="mx-3 mb-2 flex h-[3px] gap-px overflow-hidden rounded-full">
        {items.map((item) => (
          <span
            key={item.label}
            className="h-full flex-1 rounded-full transition-colors"
            style={{
              background:
                item.status === 'pass'
                  ? 'var(--color-status-green)'
                  : item.status === 'fail'
                    ? 'var(--color-status-red)'
                    : item.status === 'pending'
                      ? 'var(--color-status-yellow)'
                      : 'var(--color-status-gray)',
              opacity: item.status === 'none' ? 0.3 : 1,
            }}
          />
        ))}
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-0.5 px-3 pb-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 py-0.5">
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
                {item.label}
              </span>
            </div>
            <span className="shrink-0 text-[9px] text-[var(--color-text-muted)]">
              {item.description}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom accent line showing score */}
      <div
        className="h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${color} ${score}%, var(--color-subtle-border) ${score}%)`,
        }}
      />
    </div>
  );
}
