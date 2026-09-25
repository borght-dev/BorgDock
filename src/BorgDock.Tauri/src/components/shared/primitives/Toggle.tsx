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
        'bd-toggle inline-flex h-[18px] w-[32px] items-center rounded-full border',
        on
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
          : 'bg-[var(--color-surface-hover)] border-[var(--color-strong-border)]',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {/* The knob slides and the track recolours over --motion-fast (.bd-toggle in tool-windows.css). */}
      <span
        className="bd-toggle__knob block h-[14px] w-[14px] shrink-0 rounded-full bg-[var(--color-toggle-knob)]"
        style={{ transform: `translateX(${on ? 15 : 1}px)` }}
      />
    </button>
  );
}
