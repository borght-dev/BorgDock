import clsx from 'clsx';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Local-only switch used by Settings sections. Not a primitive — kept
 * feature-local because it has no consumer outside settings/.
 *
 * The bg-on color was previously --color-accent and the bg-off color was
 * --color-filter-chip-bg; PR #6 deletes the latter and pulls bg-off from
 * --color-surface-hover instead.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-toggle
      data-checked={checked ? 'true' : 'false'}
      onClick={() => !disabled && onChange(!checked)}
      className={clsx(
        'relative h-5 w-9 rounded-full transition-colors',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-hover)]',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div
        className={clsx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
