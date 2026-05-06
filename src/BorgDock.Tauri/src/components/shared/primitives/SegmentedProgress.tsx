import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export interface SegmentedProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of finished/successful items. */
  passed: number;
  /** Number of items currently running — rendered as an animated diagonal-stripe segment. */
  running: number;
  /** Total. When 0 the bar is empty but still renders a track. */
  total: number;
}

/**
 * SegmentedProgress — three-segment status bar (done / running / queued).
 *
 * - Solid green for the passed slice.
 * - Diagonal-stripe yellow with a marching animation for the running slice.
 * - Empty remainder (track background) for queued/unknown.
 *
 * Used by ActivityStrip; can be reused anywhere a multi-state progress is needed.
 */
export function SegmentedProgress({
  passed,
  running,
  total,
  className,
  ...rest
}: SegmentedProgressProps) {
  const safeTotal = Math.max(0, total);
  const safePassed = Math.max(0, Math.min(passed, safeTotal));
  const remainingCapacity = safeTotal - safePassed;
  const safeRunning = Math.max(0, Math.min(running, remainingCapacity));

  const passedPct = safeTotal === 0 ? 0 : (safePassed / safeTotal) * 100;
  const runningPct = safeTotal === 0 ? 0 : (safeRunning / safeTotal) * 100;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(safePassed)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeTotal)}
      className={clsx(
        'relative h-[5px] overflow-hidden rounded-[3px] bg-[var(--color-surface-hover)]',
        className,
      )}
      {...rest}
    >
      {passedPct > 0 && (
        <div
          data-segment="passed"
          className="absolute left-0 top-0 bottom-0 transition-[width] duration-[400ms] ease-out"
          style={{
            width: `${passedPct}%`,
            background: 'var(--color-status-green)',
          }}
        />
      )}
      {safeRunning > 0 && (
        <div
          data-segment="running"
          className="absolute top-0 bottom-0"
          style={{
            left: `${passedPct}%`,
            width: `${runningPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg,' +
              ' var(--color-status-yellow) 0,' +
              ' var(--color-status-yellow) 6px,' +
              ' rgba(255,255,255,0.4) 6px,' +
              ' rgba(255,255,255,0.4) 12px)',
            backgroundSize: '17px 17px',
            animationName: 'bd-stripe-march',
            animationDuration: '900ms',
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        />
      )}
    </div>
  );
}
