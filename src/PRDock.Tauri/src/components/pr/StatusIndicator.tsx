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
  return (
    <span
      className={clsx(
        'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        statusColors[status],
      )}
      aria-label={`Status: ${status}`}
    />
  );
}
