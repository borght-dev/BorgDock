import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'own';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 'own' adds the my-PR accent stripe on the left edge. */
  variant?: CardVariant;
  /** Padding preset. Default 'md'. */
  padding?: CardPadding;
  /** Hover + focus affordances + role=button. Default false. */
  interactive?: boolean;
  children: ReactNode;
}

/**
 * Card — the shared background container.
 * Replaces every ad-hoc card across PR list, Work Items, Settings, Notifications.
 */
export function Card({
  variant = 'default',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const interactiveProps = interactive
    ? { role: 'button' as const, tabIndex: 0 }
    : {};
  return (
    <div
      className={clsx(
        'bd-card',
        variant === 'own' && 'bd-card--own',
        `bd-card--pad-${padding}`,
        interactive && 'bd-card--interactive',
        className,
      )}
      {...interactiveProps}
      {...rest}
    >
      {children}
    </div>
  );
}
