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
  const color = scoreColor(clamped);

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
      style={{ border: `2px solid ${color}`, color }}
      aria-label={`Merge score: ${clamped}%`}
    >
      {clamped}
    </div>
  );
}
