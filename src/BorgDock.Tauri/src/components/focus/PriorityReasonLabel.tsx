import { Pill } from '@/components/shared/primitives';
import type { PriorityFactor } from '@/services/priority-scoring';

interface PriorityReasonLabelProps {
  factors: PriorityFactor[];
}

export function PriorityReasonLabel({ factors }: PriorityReasonLabelProps) {
  if (factors.length === 0) return null;
  // factors are pre-sorted by points descending; surface only the top reason.
  const top = factors[0]!;
  return (
    <Pill tone="neutral" data-priority-reason={top.type}>
      {top.label}
    </Pill>
  );
}
