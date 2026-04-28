import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface StatusBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Left-aligned content — typically primary metrics (PR counts, row counts). */
  left?: ReactNode;
  /** Right-aligned content — typically rate / sync / copy status. */
  right?: ReactNode;
}

/**
 * StatusBar — generalized footer chrome with left/right slots.
 * Used by the main sidebar, SQL query window, and any other window footer showing
 * sync / rate-limit / connection state.
 */
export function StatusBar({ left, right, className, ...rest }: StatusBarProps) {
  return (
    <div className={clsx('bd-statusbar', className)} {...rest}>
      <div className="bd-statusbar__side">{left}</div>
      <div className="bd-statusbar__side bd-statusbar__side--end">{right}</div>
    </div>
  );
}
