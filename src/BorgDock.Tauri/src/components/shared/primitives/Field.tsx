import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface FieldProps {
  label?: string;
  hint?: string;
  dense?: boolean;
  anchorId?: string;
  children: ReactNode;
}

export function Field({ label, hint, dense, anchorId, children }: FieldProps) {
  return (
    <div id={anchorId ? `field-${anchorId}` : undefined} className={clsx(dense ? 'mb-3' : 'mb-[18px]')}>
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
