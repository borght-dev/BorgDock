import { useMemo } from 'react';
import { computeMergeScore } from '@/services/merge-score';
import type { PullRequestWithChecks } from '@/types';

interface MultiSignalIndicatorProps {
  pr: PullRequestWithChecks;
  size?: number;
  style?: 'SegmentRing' | 'ProgressArc' | 'SignalDots';
}

type SignalColor = 'green' | 'red' | 'yellow' | 'gray';

const COLOR_MAP: Record<SignalColor, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
  gray: 'var(--color-status-gray)',
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function computeCiColor(pr: PullRequestWithChecks): SignalColor {
  if (pr.checks.length === 0) return 'gray';
  if (pr.failedCheckNames.length > 0) return 'red';
  if (pr.pendingCheckNames.length > 0) return 'yellow';
  return 'green';
}

function computeReviewColor(pr: PullRequestWithChecks): SignalColor {
  switch (pr.pullRequest.reviewStatus) {
    case 'approved':
      return 'green';
    case 'changesRequested':
      return 'red';
    case 'pending':
    case 'commented':
      return 'yellow';
    default:
      return 'gray';
  }
}

function computeConflictColor(pr: PullRequestWithChecks): SignalColor {
  if (pr.pullRequest.mergeable === false) return 'red';
  if (pr.pullRequest.mergeable === true) return 'green';
  return 'gray';
}

function computeDraftColor(pr: PullRequestWithChecks): SignalColor {
  return pr.pullRequest.isDraft ? 'yellow' : 'green';
}

// computeMergeScore imported from @/services/merge-score

function scoreColor(score: number): string {
  if (score < 50) return 'var(--color-status-red)';
  if (score <= 80) return 'var(--color-status-yellow)';
  return 'var(--color-status-green)';
}

function SegmentRing({ pr, size }: { pr: PullRequestWithChecks; size: number }) {
  const cx = 12;
  const cy = 12;
  const gap = 4; // degrees of gap between segments

  // Radii for 4 concentric rings (outermost to innermost)
  const radii = [10.5, 8, 5.5, 3];
  const strokeWidths = [2, 2, 2, 2];

  const ciColor = computeCiColor(pr);
  const reviewColor = computeReviewColor(pr);
  const conflictColor = computeConflictColor(pr);
  const draftColor = computeDraftColor(pr);

  // Each entry: signal label, color, radius, strokeWidth, quadrant start/end angles
  // Top-right: 0-90 (CI), Bottom-right: 90-180 (Review),
  // Bottom-left: 180-270 (Conflicts), Top-left: 270-360 (Draft)
  const segments: {
    label: string;
    color: SignalColor;
    r: number;
    sw: number;
    start: number;
    end: number;
  }[] = [
    {
      label: 'CI',
      color: ciColor,
      r: radii[0]!,
      sw: strokeWidths[0]!,
      start: 0 + gap / 2,
      end: 90 - gap / 2,
    },
    {
      label: 'Review',
      color: reviewColor,
      r: radii[1]!,
      sw: strokeWidths[1]!,
      start: 90 + gap / 2,
      end: 180 - gap / 2,
    },
    {
      label: 'Conflicts',
      color: conflictColor,
      r: radii[2]!,
      sw: strokeWidths[2]!,
      start: 180 + gap / 2,
      end: 270 - gap / 2,
    },
    {
      label: 'Draft',
      color: draftColor,
      r: radii[3]!,
      sw: strokeWidths[3]!,
      start: 270 + gap / 2,
      end: 360 - gap / 2,
    },
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-label={`CI: ${ciColor}, Review: ${reviewColor}, Conflicts: ${conflictColor}, Draft: ${draftColor}`}
    >
      {segments.map((seg) => (
        <g key={seg.label}>
          {/* Background track for this ring */}
          <circle
            cx={cx}
            cy={cy}
            r={seg.r}
            fill="none"
            stroke="var(--color-subtle-border)"
            strokeWidth={seg.sw}
            opacity={0.5}
          />
          {/* Colored arc segment */}
          <path
            d={arcPath(cx, cy, seg.r, seg.start, seg.end)}
            fill="none"
            stroke={COLOR_MAP[seg.color]}
            strokeWidth={seg.sw}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

function ProgressArc({ pr, size }: { pr: PullRequestWithChecks; size: number }) {
  const score = computeMergeScore(pr);
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (clamped / 100) * circumference;
  const color = scoreColor(clamped);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-label={`Merge score: ${clamped}%`}
    >
      {/* Background track */}
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--color-subtle-border)"
        strokeWidth="2.5"
      />
      {/* Score arc (starts at 12 o'clock via rotate -90) */}
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${arcLength} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
      />
      {/* Score text in center */}
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-text-secondary)"
        fontSize="7"
        fontWeight="600"
      >
        {clamped}
      </text>
    </svg>
  );
}

export function MultiSignalIndicator({
  pr,
  size = 24,
  style = 'SegmentRing',
}: MultiSignalIndicatorProps) {
  const content = useMemo(() => {
    if (style === 'ProgressArc') {
      return <ProgressArc pr={pr} size={size} />;
    }
    return <SegmentRing pr={pr} size={size} />;
  }, [pr, size, style]);

  return content;
}
