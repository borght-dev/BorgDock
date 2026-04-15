import type { PriorityFactor } from '@/services/priority-scoring';

interface PriorityReasonLabelProps {
  factors: PriorityFactor[];
}

export function PriorityReasonLabel({ factors }: PriorityReasonLabelProps) {
  if (factors.length === 0) return null;

  return (
    <span className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">
      {factors.map((f, i) => (
        <span key={f.type}>
          {i > 0 && <span className="mx-1 text-[var(--color-text-ghost)]">{'\u00b7'}</span>}
          <span
            className={
              f.type === 'readyToMerge'
                ? 'text-[var(--color-status-green)] font-medium'
                : f.type.includes('Red') ||
                    f.type.includes('red') ||
                    f.type === 'myPrRedChecks' ||
                    f.type === 'othersRedChecks'
                  ? 'text-[var(--color-status-red)]'
                  : f.type.includes('Stale') || f.type === 'staleness' || f.type === 'reviewStale'
                    ? 'text-[var(--color-status-yellow)]'
                    : ''
            }
          >
            {f.label}
          </span>
        </span>
      ))}
    </span>
  );
}
