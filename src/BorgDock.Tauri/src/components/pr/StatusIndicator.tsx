import { Dot } from '@/components/shared/primitives';
import type { OverallStatus } from '@/types';

interface StatusIndicatorProps {
  status: OverallStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <Dot
      tone={status}
      pulse={status === 'yellow'}
      size={10}
      aria-label={`Status: ${status}`}
    />
  );
}
