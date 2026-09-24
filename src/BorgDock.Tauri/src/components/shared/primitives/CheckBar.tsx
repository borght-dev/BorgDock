import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type CheckBarState = 'fail' | 'run' | 'ok' | 'none';

export interface CheckBarCounts {
  /** Checks that passed. */
  ok: number;
  /** Checks that failed. */
  fail: number;
  /** Checks still queued or in progress. */
  run: number;
  /** Every check, including skipped and neutral ones. */
  total: number;
}

export interface CheckBarProps
  extends CheckBarCounts,
    Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {}

/**
 * The label and tone a CheckBar shows for a set of counts. Failures win over
 * running checks, running checks win over passing ones. "k of N, running"
 * counts every finished check (skipped included); "N passing" counts only `ok`.
 */
export function checkBarSummary({ ok, fail, run, total }: CheckBarCounts): {
  state: CheckBarState;
  label: string;
} {
  if (total <= 0) return { state: 'none', label: 'No checks' };
  if (fail > 0) return { state: 'fail', label: `${fail} failing` };
  if (run > 0) return { state: 'run', label: `${total - run} of ${total}, running` };
  // Skipped and neutral checks are not "passing": count only the green ones.
  return { state: 'ok', label: `${ok} passing` };
}

function share(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%';
  return `${Math.min(100, (part / total) * 100)}%`;
}

/**
 * CheckBar — check count plus a 44px bar split into passing, failing and
 * running segments in proportion to `total`. Skipped checks leave the track
 * showing. The label is red when anything failed and amber while checks run.
 */
export function CheckBar({ ok, fail, run, total, className, ...rest }: CheckBarProps) {
  const { state, label } = checkBarSummary({ ok, fail, run, total });
  return (
    <span className={clsx('bd-checkbar', `bd-checkbar--${state}`, className)} {...rest}>
      <span className="bd-checkbar__bar" aria-hidden="true">
        <span
          className="bd-checkbar__seg bd-checkbar__seg--ok"
          style={{ width: share(ok, total) }}
        />
        <span
          className="bd-checkbar__seg bd-checkbar__seg--fail"
          style={{ width: share(fail, total) }}
        />
        <span
          className="bd-checkbar__seg bd-checkbar__seg--run"
          style={{ width: share(run, total) }}
        />
      </span>
      <span className="bd-checkbar__label">{label}</span>
    </span>
  );
}
