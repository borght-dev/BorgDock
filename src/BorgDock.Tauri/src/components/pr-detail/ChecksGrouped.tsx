import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { ProgressButton } from '@/components/shared/primitives';
import { useProgressAction } from '@/hooks/useProgressAction';
import type { FirstFailure } from '@/services/first-failure';
import type { CheckRun } from '@/types';
import {
  type CheckGroup,
  checkStateOf,
  durationOf,
  groupChecks,
  groupSummary,
  isOpenByDefault,
} from './check-groups';

export interface ChecksGroupedProps {
  checks: CheckRun[];
  /** "Fix with Claude" on a failed row. Omitted: no fix button. */
  onFix?: (run: CheckRun) => void;
  /**
   * Rerun a failing suite. Resolves false when it failed (and the user was
   * told). Omitted: no rerun button.
   */
  onRerun?: (group: CheckGroup) => Promise<boolean>;
  /** Log excerpt of the first failure, shown under the suites. */
  firstFailure?: FirstFailure | null;
}

function openRun(run: CheckRun) {
  if (!run.htmlUrl || run.htmlUrl === '#') return;
  openUrl(run.htmlUrl).catch(console.error);
}

function RowStatus({ run }: { run: CheckRun }) {
  const state = checkStateOf(run);
  if (state === 'running') return <span className="bd-checks-grouped__time">running</span>;
  const duration = durationOf(run);
  if (state === 'failed' && !duration)
    return <span className="bd-checks-grouped__time">failed</span>;
  if (state === 'skipped' && !duration) {
    return <span className="bd-checks-grouped__time">skipped</span>;
  }
  return <span className="bd-checks-grouped__time">{duration}</span>;
}

function RerunButton({
  group,
  onRerun,
}: {
  group: CheckGroup;
  onRerun: ChecksGroupedProps['onRerun'];
}) {
  const action = useProgressAction(
    () => onRerun?.(group) ?? Promise.resolve(false),
    'Rerun failed',
  );
  return (
    <ProgressButton
      variant="ghost"
      size="sm"
      className="bd-checks-grouped__rerun"
      state={action.state}
      onTrigger={() => void action.trigger()}
      label="Rerun"
      busyLabel="Rerunning"
      doneLabel="Rerun started"
      aria-label={`Rerun ${group.name}`}
      data-check-action="rerun"
    />
  );
}

function Suite({
  group,
  onFix,
  onRerun,
}: {
  group: CheckGroup;
  onFix?: ChecksGroupedProps['onFix'];
  onRerun?: ChecksGroupedProps['onRerun'];
}) {
  const canRerun = onRerun !== undefined && group.state === 'failed' && group.canRerun;
  return (
    <details
      className="bd-checks-grouped__suite"
      data-suite={group.name}
      data-suite-state={group.state}
      open={isOpenByDefault(group)}
    >
      <summary className="bd-checks-grouped__summary">
        <ChevronRight className="bd-checks-grouped__caret" size={12} aria-hidden="true" />
        <span className="bd-checks-grouped__dot" data-state={group.state} aria-hidden="true" />
        <span className="bd-checks-grouped__name">{group.name}</span>
        <span className="bd-checks-grouped__count" data-state={group.state}>
          {groupSummary(group)}
        </span>
        {canRerun && (
          // A button inside <summary> is its own activation target, so a
          // click on it reruns without toggling the suite.
          <span className="bd-checks-grouped__actions">
            <RerunButton group={group} onRerun={onRerun} />
          </span>
        )}
      </summary>
      <div className="bd-checks-grouped__body">
        <div className="bd-checks-grouped__rows">
          {group.runs.map((run) => {
            const state = checkStateOf(run);
            return (
              <div
                key={run.id}
                className={clsx('bd-checks-grouped__row', `bd-checks-grouped__row--${state}`)}
                data-check-row=""
                data-check-state={state}
              >
                <span className="bd-checks-grouped__dot" data-state={state} aria-hidden="true" />
                <button
                  type="button"
                  className="bd-checks-grouped__run"
                  title={run.name}
                  onClick={() => openRun(run)}
                >
                  {run.name}
                </button>
                {state === 'failed' && onFix && (
                  <button
                    type="button"
                    className="bd-checks-grouped__fix"
                    data-check-action="fix"
                    onClick={() => onFix(run)}
                  >
                    Fix with Claude
                  </button>
                )}
                <RowStatus run={run} />
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

/**
 * ChecksGrouped — the detail view's checks, grouped by suite
 * (plans/ui-overhaul-workbench.md, phase 3). Each suite is a `<details>`:
 * failing suites come first and start open, running suites next, passing
 * and skipped suites collapsed. Rows run failed → running → passed → skipped
 * with the duration on the right; a failed row offers "Fix with Claude" and
 * a failing suite "Rerun". The first failure's log excerpt sits underneath.
 */
export function ChecksGrouped({ checks, onFix, onRerun, firstFailure }: ChecksGroupedProps) {
  const groups = groupChecks(checks);
  const passed = checks.filter((c) => checkStateOf(c) === 'passed').length;
  return (
    <div className="bd-checks-grouped" data-checks-grouped="">
      <h3 className="bd-checks-grouped__heading">
        Checks
        <span>
          {passed} of {checks.length} passed in {groups.length}{' '}
          {groups.length === 1 ? 'suite' : 'suites'}
        </span>
      </h3>
      <div className="bd-checks-grouped__suites">
        {groups.map((group) => (
          <Suite key={group.name} group={group} onFix={onFix} onRerun={onRerun} />
        ))}
      </div>
      {firstFailure && firstFailure.lines.length > 0 && (
        <section className="bd-checks-grouped__failure" aria-label="First failure">
          <h3 className="bd-checks-grouped__heading">
            First failure
            <span>{firstFailure.checkName}</span>
          </h3>
          <pre className="bd-checks-grouped__log">
            {firstFailure.lines.map((line, i) => (
              // Lines are positional; the excerpt never reorders.
              // biome-ignore lint/suspicious/noArrayIndexKey: static excerpt
              <span key={i} className={clsx(i === 0 && 'bd-checks-grouped__log-head')}>
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}
