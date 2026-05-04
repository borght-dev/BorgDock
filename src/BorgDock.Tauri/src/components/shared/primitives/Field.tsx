import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useFieldPulse } from '@/components/settings/useFieldPulse';

export interface FieldProps {
  label?: string;
  hint?: string;
  dense?: boolean;
  anchorId?: string;
  children: ReactNode;
}

export function Field({ label, hint, dense, anchorId, children }: FieldProps) {
  const pulse = useFieldPulse(anchorId);
  return (
    <div
      id={anchorId ? `field-${anchorId}` : undefined}
      className={clsx(
        dense ? 'mb-3' : 'mb-[18px]',
        pulse,
        // Tiny inset so the pulse background reads as a highlight, not a flash
        '-mx-1 px-1 rounded',
      )}
    >
      {label && (
        <div className="mb-1.5 text-[11.5px] font-medium text-[var(--color-text-secondary)]">{label}</div>
      )}
      {children}
      {hint && (
        <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{hint}</div>
      )}
    </div>
  );
}
