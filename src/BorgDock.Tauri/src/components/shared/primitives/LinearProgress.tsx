import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type LinearProgressTone = 'accent' | 'success' | 'warning' | 'error';

export interface LinearProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Value 0..100. Clamped on render. */
  value: number;
  /** Fill tone. Default 'accent'. */
  tone?: LinearProgressTone;
}

/**
 * LinearProgress — 4px filled track.
 * Used by rate-limit meter, readiness bar, check suite aggregate.
 */
export function LinearProgress({
  value,
  tone = 'accent',
  className,
  ...rest
}: LinearProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx('bd-linear', className)}
      {...rest}
    >
      <div
        className={clsx('bd-linear__fill', `bd-linear__fill--${tone}`)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
