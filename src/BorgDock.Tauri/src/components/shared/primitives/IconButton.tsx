import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonSize = 22 | 26 | 30;

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Icon node rendered centred. */
  icon: ReactNode;
  /** Highlighted on/active state — e.g. pinned sidebar button. */
  active?: boolean;
  /** Native tooltip text. Duplicates `aria-label` for mouse users. */
  tooltip?: string;
  /** Square size in pixels. 22 → sm, 26 → default, 30 → lg. */
  size?: IconButtonSize;
  /** Button type. Defaults to "button". */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * IconButton — square button with a single icon child.
 * Replaces the ad-hoc `.tactile-icon-btn` / `.bd-icon-btn` usages across the app.
 */
export function IconButton({
  icon,
  active = false,
  tooltip,
  size = 26,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={tooltip}
      className={clsx(
        'bd-icon-btn',
        active && 'bd-icon-btn--active',
        size === 22 && 'bd-icon-btn--sm',
        size === 30 && 'bd-icon-btn--lg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
