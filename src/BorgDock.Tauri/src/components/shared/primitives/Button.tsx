import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual variant — drives background + border + focus treatment. */
  variant: ButtonVariant;
  /** Height + horizontal padding + font size preset. */
  size: ButtonSize;
  /** Optional icon rendered before the label. Swapped for a spinner when `loading`. */
  leading?: ReactNode;
  /** Optional icon rendered after the label. */
  trailing?: ReactNode;
  /** When true the leading adornment becomes a spinner and the button is disabled. */
  loading?: boolean;
  /** Label. */
  children: ReactNode;
  /** Button type. Defaults to "button" so it never accidentally submits a parent form. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Button — the one shared button used for every non-icon action.
 * Variants: primary (accent fill), secondary (subtle border), ghost (no border), danger (dashed red).
 * Sizes: sm (24h/11px), md (28h/12px), lg (32h/13px).
 */
export function Button({
  variant,
  size,
  leading,
  trailing,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: explicit default above
      type={type}
      className={clsx(
        'bd-btn',
        variant === 'primary' && 'bd-btn--primary',
        variant === 'ghost' && 'bd-btn--ghost',
        variant === 'danger' && 'bd-btn--danger',
        size === 'sm' && 'bd-btn--sm',
        size === 'lg' && 'bd-btn--lg',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="bd-btn__spinner" aria-hidden /> : leading}
      {children}
      {trailing}
    </button>
  );
}
