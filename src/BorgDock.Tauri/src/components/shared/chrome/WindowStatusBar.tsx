import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { Kbd } from '../primitives/Kbd';

/** One keyboard hint: the key chip and what it does. */
export interface StatusBarHint {
  keys: string;
  label: string;
}

export interface WindowStatusBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Left-aligned content — typically primary metrics (PR counts, row counts). */
  left?: ReactNode;
  /** Right-aligned content — typically rate / sync / copy status. */
  right?: ReactNode;
  /** Keyboard hints, rendered as `Kbd` chips with a label after `right`. */
  hints?: ReadonlyArray<StatusBarHint>;
}

/**
 * WindowStatusBar — the footer every tool window shares with the main window
 * (`.bd-statusbar`): one hairline on top, Inter 11 px with tabular numerals,
 * left and right slots, and keyboard hints as `Kbd` chips.
 */
export function WindowStatusBar({ left, right, hints, className, ...rest }: WindowStatusBarProps) {
  return (
    <div className={clsx('bd-statusbar', className)} {...rest}>
      <div className="bd-statusbar__side">{left}</div>
      <div className="bd-statusbar__side bd-statusbar__side--end">
        {right}
        {hints && hints.length > 0 && (
          <span className="bd-statusbar__hints">
            {hints.map((h) => (
              <span key={`${h.keys}-${h.label}`} className="bd-statusbar__hint">
                <Kbd>{h.keys}</Kbd>
                {h.label}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
