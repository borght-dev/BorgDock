import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface TextInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  mono?: boolean;
  suffix?: ReactNode;
  ariaLabel?: string;
}

export function TextInput({ value, onChange, placeholder, type = 'text', mono, suffix, ariaLabel }: TextInputProps) {
  return (
    <div className="flex h-[30px] items-center gap-2 rounded-[5px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-[10px]">
      <input
        type={type}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'flex-1 bg-transparent text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-faint)]',
          mono && 'font-mono text-[11.5px]',
        )}
      />
      {suffix && <span className="text-[11px] text-[var(--color-text-muted)]">{suffix}</span>}
    </div>
  );
}
