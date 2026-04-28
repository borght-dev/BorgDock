import { Ring } from '@/components/shared/primitives';

interface MergeScoreBadgeProps {
  score: number; // 0-100
}

export function MergeScoreBadge({ score }: MergeScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return <Ring value={clamped} size={32} label aria-label={`Merge score: ${clamped}%`} />;
}
