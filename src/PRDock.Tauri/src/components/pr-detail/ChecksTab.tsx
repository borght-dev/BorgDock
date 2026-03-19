import clsx from 'clsx';
import type { CheckRun } from '@/types';

interface ChecksTabProps {
  checks: CheckRun[];
}

/* ── Helpers ────────────────────────────────────────── */

type CheckState = 'passed' | 'failed' | 'pending' | 'skipped';

function classifyCheck(run: CheckRun): CheckState {
  if (run.status === 'in_progress' || run.status === 'queued') return 'pending';
  switch (run.conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'timed_out':
      return 'failed';
    case 'skipped':
    case 'cancelled':
    case 'neutral':
      return 'skipped';
    default:
      return 'pending';
  }
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return '';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function groupBySuite(checks: CheckRun[]): Map<number, CheckRun[]> {
  const groups = new Map<number, CheckRun[]>();
  for (const check of checks) {
    const existing = groups.get(check.checkSuiteId);
    if (existing) {
      existing.push(check);
    } else {
      groups.set(check.checkSuiteId, [check]);
    }
  }
  return groups;
}

function suiteStatus(runs: CheckRun[]): CheckState {
  if (runs.some((r) => classifyCheck(r) === 'failed')) return 'failed';
  if (runs.some((r) => classifyCheck(r) === 'pending')) return 'pending';
  if (runs.every((r) => classifyCheck(r) === 'skipped')) return 'skipped';
  return 'passed';
}

/* ── Status icon SVGs ──────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="7" fill="var(--color-status-green)" opacity="0.12" />
      <path
        d="M5 8.5l2 2 4-4"
        stroke="var(--color-status-green)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="7" fill="var(--color-status-red)" opacity="0.12" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="var(--color-status-red)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={clsx('animate-spin', className)}
    >
      <circle cx="8" cy="8" r="6" stroke="var(--color-status-yellow)" opacity="0.2" strokeWidth="1.6" />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="var(--color-status-yellow)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SkipIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="7" fill="var(--color-status-gray)" opacity="0.1" />
      <path
        d="M5 8h6"
        stroke="var(--color-status-gray)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusSvg({ state, className }: { state: CheckState; className?: string }) {
  switch (state) {
    case 'passed':
      return <CheckIcon className={className} />;
    case 'failed':
      return <FailIcon className={className} />;
    case 'pending':
      return <SpinnerIcon className={className} />;
    case 'skipped':
      return <SkipIcon className={className} />;
  }
}

/* ── Summary bar ───────────────────────────────────── */

function SummaryBar({ checks }: { checks: CheckRun[] }) {
  const passed = checks.filter((c) => classifyCheck(c) === 'passed').length;
  const failed = checks.filter((c) => classifyCheck(c) === 'failed').length;
  const pending = checks.filter((c) => classifyCheck(c) === 'pending').length;
  const skipped = checks.filter((c) => classifyCheck(c) === 'skipped').length;
  const total = checks.length;
  const relevant = total - skipped;

  return (
    <div className="checks-summary">
      {/* Progress segments */}
      <div className="checks-progress-bar">
        {relevant > 0 ? (
          <>
            {passed > 0 && (
              <div
                className="checks-progress-segment checks-progress-passed"
                style={{ width: `${(passed / relevant) * 100}%` }}
              />
            )}
            {failed > 0 && (
              <div
                className="checks-progress-segment checks-progress-failed"
                style={{ width: `${(failed / relevant) * 100}%` }}
              />
            )}
            {pending > 0 && (
              <div
                className="checks-progress-segment checks-progress-pending"
                style={{ width: `${(pending / relevant) * 100}%` }}
              />
            )}
          </>
        ) : (
          <div className="checks-progress-segment checks-progress-skipped" style={{ width: '100%' }} />
        )}
      </div>

      {/* Count chips */}
      <div className="checks-counts">
        {passed > 0 && (
          <span className="checks-count checks-count-passed">
            <CheckIcon /> {passed} passed
          </span>
        )}
        {failed > 0 && (
          <span className="checks-count checks-count-failed">
            <FailIcon /> {failed} failed
          </span>
        )}
        {pending > 0 && (
          <span className="checks-count checks-count-pending">
            <SpinnerIcon /> {pending} in progress
          </span>
        )}
        {skipped > 0 && (
          <span className="checks-count checks-count-skipped">
            <SkipIcon /> {skipped} skipped
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────── */

export function ChecksTab({ checks }: ChecksTabProps) {
  if (checks.length === 0) {
    return (
      <div className="checks-empty">
        <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
          <path d="m3 8.5 3.5 3.5 6.5-8" />
        </svg>
        <span>No CI checks configured</span>
      </div>
    );
  }

  const grouped = groupBySuite(checks);

  // Sort: failed suites first, then pending, then passed, then skipped
  const sortOrder: Record<CheckState, number> = { failed: 0, pending: 1, passed: 2, skipped: 3 };
  const sortedEntries = [...grouped.entries()].sort(
    ([, a], [, b]) => sortOrder[suiteStatus(a)] - sortOrder[suiteStatus(b)],
  );

  return (
    <div className="checks-tab">
      <SummaryBar checks={checks} />

      <div className="checks-suites">
        {sortedEntries.map(([suiteId, runs], suiteIdx) => {
          const status = suiteStatus(runs);
          // Sort within suite: failed first
          const sortedRuns = [...runs].sort(
            (a, b) => sortOrder[classifyCheck(a)] - sortOrder[classifyCheck(b)],
          );

          return (
            <div
              key={suiteId}
              className={clsx('checks-suite', `checks-suite--${status}`)}
              style={{ animationDelay: `${suiteIdx * 50}ms` }}
            >
              {/* Suite runs */}
              {sortedRuns.map((run) => {
                const state = classifyCheck(run);
                const duration = formatDuration(run.startedAt, run.completedAt);

                return (
                  <a
                    key={run.id}
                    href={run.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx('checks-run', `checks-run--${state}`)}
                  >
                    <StatusSvg state={state} className="checks-run-icon" />
                    <span className="checks-run-name">{run.name}</span>
                    {state === 'pending' && (
                      <span className="checks-run-status-label">running</span>
                    )}
                    {duration && <span className="checks-run-duration">{duration}</span>}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      className="checks-run-arrow"
                    >
                      <path d="m6 4 4 4-4 4" />
                    </svg>
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
