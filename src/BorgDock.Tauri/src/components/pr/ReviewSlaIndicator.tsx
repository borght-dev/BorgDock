import clsx from 'clsx';
import type { ReviewSlaTier } from '@/services/review-sla';

interface ReviewSlaIndicatorProps {
  tier: ReviewSlaTier;
  waitTime: string;
}

const tierStyles: Record<ReviewSlaTier, { dot: string; text: string; label: string }> = {
  fresh: {
    dot: 'bg-[var(--color-status-green)]',
    text: 'text-[var(--color-status-green)]',
    label: 'Requested recently',
  },
  aging: {
    dot: 'bg-[var(--color-status-yellow)] animate-pulse',
    text: 'text-[var(--color-status-yellow)]',
    label: 'Waiting for review',
  },
  stale: {
    dot: 'bg-[var(--color-status-red)] animate-pulse',
    text: 'text-[var(--color-status-red)]',
    label: 'Urgent — review overdue',
  },
};

export function ReviewSlaIndicator({ tier, waitTime }: ReviewSlaIndicatorProps) {
  const style = tierStyles[tier];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: `color-mix(in srgb, ${tier === 'fresh' ? 'var(--color-status-green)' : tier === 'aging' ? 'var(--color-status-yellow)' : 'var(--color-status-red)'} 30%, transparent)`,
        background: `color-mix(in srgb, ${tier === 'fresh' ? 'var(--color-status-green)' : tier === 'aging' ? 'var(--color-status-yellow)' : 'var(--color-status-red)'} 8%, transparent)`,
      }}
      title={style.label}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
      <span className={style.text}>{waitTime}</span>
    </span>
  );
}
