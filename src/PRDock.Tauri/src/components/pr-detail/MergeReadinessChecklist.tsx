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
  const draftDesc = pr.pullRequest.isDraft
    ? 'PR is marked as draft'
    : 'Ready for review';

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
          <circle cx="8" cy="8" r="3" stroke="var(--color-status-yellow)" strokeWidth="1.5" fill="none" />
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

function ScoreArc({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (clamped / 100) * circumference;
  const color = scoreColor(clamped);

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      {/* Background track */}
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="var(--color-subtle-border)"
        strokeWidth="5"
      />
      {/* Score arc */}
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${arcLength} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
      />
      {/* Score number */}
      <text
        x="36"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-text-primary)"
        fontSize="18"
        fontWeight="700"
      >
        {clamped}
      </text>
      {/* Label */}
      <text
        x="36"
        y="46"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-text-muted)"
        fontSize="8"
      >
        score
      </text>
    </svg>
  );
}

export function MergeReadinessChecklist({ pr }: MergeReadinessChecklistProps) {
  const items = getCheckItems(pr);
  const score = computeMergeScore(pr);

  return (
    <div className="flex items-start gap-4 rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] p-3">
      {/* Left side: checklist items */}
      <div className="flex flex-1 flex-col gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-2">
            <StatusIcon status={item.status} />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--color-text-primary)]">
                {item.label}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                {item.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Right side: score arc */}
      <div className="flex shrink-0 flex-col items-center">
        <ScoreArc score={score} />
      </div>
    </div>
  );
}
