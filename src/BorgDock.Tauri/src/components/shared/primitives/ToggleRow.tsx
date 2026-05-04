import clsx from 'clsx';
import { Toggle } from './Toggle';

export interface ToggleRowProps {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  /** When true, omit the bottom border (use on the last row of a card). */
  last?: boolean;
}

export function ToggleRow({ label, hint, on, onChange, last }: ToggleRowProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-4 py-3',
        !last && 'border-b border-[var(--color-subtle-border)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--color-text-primary)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{hint}</div>}
      </div>
      <Toggle on={on} onChange={onChange} ariaLabel={label} />
    </div>
  );
}
