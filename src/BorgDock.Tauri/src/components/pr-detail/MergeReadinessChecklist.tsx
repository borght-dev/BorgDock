import { LinearProgress } from '@/components/shared/primitives';
import { computeMergeScore } from '@/services/merge-score';
import type { PullRequestWithChecks } from '@/types';

const BoltIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    className="text-[var(--color-accent)]"
  >
    <path d="M9 1 3 9h4l-1 6 6-8H8z" />
  </svg>
);

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
  if (score < 80) return 'var(--color-status-yellow)';
  return 'var(--color-status-green)';
}

function scoreTone(score: number): 'success' | 'warning' | 'error' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
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

export function MergeReadinessChecklist({ pr }: MergeReadinessChecklistProps) {
  const items = getCheckItems(pr);
  const score = computeMergeScore(pr);
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = scoreColor(score);

  return (
    <div
      className="rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface)] overflow-hidden"
      data-merge-score={clampedScore}
    >
      {/* Header: bolt + label on the left, score on the right */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <BoltIcon />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-ghost)]">
            Merge Readiness
          </span>
        </div>
        <span
          className="text-base font-semibold tabular-nums"
          style={{ color }}
        >
          {clampedScore}
        </span>
      </div>

      {/* Linear readiness bar */}
      <div className="mx-4 mb-3">
        <LinearProgress value={clampedScore} tone={scoreTone(clampedScore)} />
      </div>

      {/* Checklist items */}
      <div className="flex flex-col px-4 pb-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 py-1.5"
            data-merge-check={item.label}
          >
            <StatusIcon status={item.status} />
            <span className="flex-1 text-[13px] font-medium text-[var(--color-text-primary)]">
              {item.label}
            </span>
            <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
              {item.description}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom accent line showing score */}
      {/* style: score-driven gradient stop position — computed per render, no Tailwind utility */}
      <div
        className="h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${color} ${score}%, var(--color-subtle-border) ${score}%)`,
        }}
      />
    </div>
  );
}
