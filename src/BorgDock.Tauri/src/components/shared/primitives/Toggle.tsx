import clsx from 'clsx';

export interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ on, onChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        'relative h-[18px] w-[32px] rounded-full border transition-colors',
        on
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
          : 'bg-[var(--color-surface-hover)] border-[var(--color-strong-border)]',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className="absolute top-[1px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]"
        style={{ left: on ? 15 : 1 }}
      />
    </button>
  );
}
