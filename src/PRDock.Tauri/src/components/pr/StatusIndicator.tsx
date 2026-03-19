import clsx from 'clsx';
import type { OverallStatus } from '@/types';

const statusColors: Record<OverallStatus, string> = {
  green: 'bg-[var(--color-status-green)]',
  red: 'bg-[var(--color-status-red)]',
  yellow: 'bg-[var(--color-status-yellow)]',
  gray: 'bg-[var(--color-status-gray)]',
};

interface StatusIndicatorProps {
  status: OverallStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  // Show spinning arc for in-progress (yellow) status
  if (status === 'yellow') {
    return (
      <span className="inline-block h-2.5 w-2.5 shrink-0" aria-label="Status: in progress">
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          className="animate-spin"
        >
          <path
            d="M6 1a5 5 0 1 0 5 5"
            stroke="var(--color-status-yellow)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={clsx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', statusColors[status])}
      aria-label={`Status: ${status}`}
    />
  );
}
