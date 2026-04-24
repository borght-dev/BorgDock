import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ChipTone = 'neutral' | 'error';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Whether the chip is selected. Default false. */
  active?: boolean;
  /** Trailing count badge. `undefined` hides it; `0` still shows. */
  count?: number;
  /** When `active`, swap the default neutral tone for `error`. */
  tone?: ChipTone;
  /** Chip label. */
  children: ReactNode;
}

/**
 * Chip — toggleable filter pill with an optional trailing count.
 * Used by every filter bar (PR list, Work Items, detail tab filters).
 */
export function Chip({
  active = false,
  count,
  tone = 'neutral',
  className,
  children,
  ...rest
}: ChipProps) {
  const activeToneClass =
    tone === 'error' ? 'bd-pill--error' : 'bd-pill--neutral';
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        'bd-pill',
        'bd-chip',
        active ? activeToneClass : 'bd-pill--ghost',
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <span
          className="bd-chip__count"
          style={{
            fontSize: 10,
            padding: '0 5px',
            borderRadius: 999,
            background: active ? 'rgba(0,0,0,0.08)' : 'var(--color-surface-hover)',
            color: 'inherit',
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
