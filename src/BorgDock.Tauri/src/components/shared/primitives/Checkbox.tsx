import clsx from 'clsx';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}

export function Checkbox({ checked, onChange, label, hint }: CheckboxProps) {
  return (
    <label className="flex items-center gap-[10px] py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={clsx(
          'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
          checked
            ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
            : 'bg-[var(--color-input-bg)] border-[var(--color-strong-border)]',
        )}
      >
        {checked && <Check size={11} strokeWidth={2.5} />}
      </span>
      <span>
        <span className="text-xs text-[var(--color-text-primary)]">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">{hint}</span>
        )}
      </span>
    </label>
  );
}
