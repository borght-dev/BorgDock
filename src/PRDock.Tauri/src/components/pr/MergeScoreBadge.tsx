interface MergeScoreBadgeProps {
  score: number; // 0-100
}

function scoreColor(score: number): string {
  if (score <= 33) return 'var(--color-status-red)';
  if (score <= 66) return 'var(--color-status-yellow)';
  return 'var(--color-status-green)';
}

export function MergeScoreBadge({ score }: MergeScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (clamped / 100) * circumference;
  const color = scoreColor(clamped);

  return (
    <svg
      width="24"
      height="24"
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
      {/* Score arc */}
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
    </svg>
  );
}
