import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { ProgressState } from '@/hooks/useProgressAction';
import { Button, type ButtonProps } from './Button';

export interface ProgressButtonProps extends Omit<ButtonProps, 'children' | 'onClick' | 'loading'> {
  /** State from `useProgressAction`. */
  state: ProgressState;
  onTrigger: () => void;
  /** Label at rest. */
  label: ReactNode;
  /** Label while the request runs, e.g. "Merging". */
  busyLabel: ReactNode;
  /** Label after it succeeded, e.g. "Merged". */
  doneLabel: ReactNode;
}

/**
 * ProgressButton — a `Button` that fills from the left while its request is
 * in flight (`--motion-*` tokens, instant under reduced motion) and then
 * flips to its result label. Pair with `useProgressAction`. A second click
 * while busy does nothing.
 */
export function ProgressButton({
  state,
  onTrigger,
  label,
  busyLabel,
  doneLabel,
  className,
  ...rest
}: ProgressButtonProps) {
  return (
    <Button
      {...rest}
      className={clsx('bd-progress-btn', className)}
      data-progress={state}
      aria-busy={state === 'busy' || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (state !== 'busy') onTrigger();
      }}
    >
      <span key={state} className="bd-progress-btn__label">
        {state === 'busy' ? busyLabel : state === 'done' ? doneLabel : label}
      </span>
    </Button>
  );
}
