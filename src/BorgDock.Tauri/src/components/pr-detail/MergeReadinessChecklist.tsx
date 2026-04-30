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

// Icon-only glyphs used inside the round status badge below
const CheckGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M4 8.5l2.5 2.5L12 5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const XGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M5 5l6 6M11 5l-6 6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
const ClockGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 5.5V8l1.6 1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const DashGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M5 8h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function StatusIcon({ status }: { status: CheckStatus }) {
  // Token triple per status — keeps the badge in sync with pills/chips elsewhere.
  const tokens = {
    pass: {
      bg: 'var(--color-success-badge-bg)',
      fg: 'var(--color-success-badge-fg)',
      bd: 'var(--color-success-badge-border)',
    },
    fail: {
      bg: 'var(--color-error-badge-bg)',
      fg: 'var(--color-error-badge-fg)',
      bd: 'var(--color-error-badge-border)',
    },
    pending: {
      bg: 'var(--color-warning-badge-bg)',
      fg: 'var(--color-warning-badge-fg)',
      bd: 'var(--color-warning-badge-border)',
    },
    none: {
      bg: 'var(--color-draft-badge-bg)',
      fg: 'var(--color-draft-badge-fg)',
      bd: 'var(--color-draft-badge-border)',
    },
  }[status];

  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border"
      style={{ background: tokens.bg, color: tokens.fg, borderColor: tokens.bd }}
    >
      {status === 'pass' && <CheckGlyph />}
      {status === 'fail' && <XGlyph />}
      {status === 'pending' && <ClockGlyph />}
      {status === 'none' && <DashGlyph />}
    </span>
  );
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
      {/* Header row: bolt + label on the left, inline progress bar + score on the right */}
      <div className="flex items-center gap-3 border-b border-[var(--color-subtle-border)] px-3.5 py-3">
        <BoltIcon />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
          Merge Readiness
        </span>
        <span className="flex-1" />
        <div className="w-[160px]">
          <LinearProgress value={clampedScore} tone={scoreTone(clampedScore)} />
        </div>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
          {clampedScore}
        </span>
      </div>

      {/* Checklist items — each row separated by a subtle divider; last row has none */}
      <div className="flex flex-col">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className={
              'flex items-center gap-2.5 px-3.5 py-2' +
              (idx < items.length - 1
                ? ' border-b border-[var(--color-subtle-border)]'
                : '')
            }
            data-merge-check={item.label}
          >
            <StatusIcon status={item.status} />
            <span className="flex-1 text-[12px] font-medium text-[var(--color-text-primary)]">
              {item.label}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
              {item.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
