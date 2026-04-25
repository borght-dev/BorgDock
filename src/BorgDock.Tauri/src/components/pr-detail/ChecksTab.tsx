import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { useCallback } from 'react';
import {
  Button,
  Card,
  LinearProgress,
  type LinearProgressTone,
  Pill,
} from '@/components/shared/primitives';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import type { CheckRun, PullRequestWithChecks } from '@/types';

interface ChecksTabProps {
  checks: CheckRun[];
  pr?: PullRequestWithChecks;
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

function summaryProgressTone(
  passed: number,
  failed: number,
  pending: number,
): LinearProgressTone {
  if (failed > 0) return 'error';
  if (pending > 0) return 'warning';
  if (passed > 0) return 'success';
  return 'accent';
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
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="var(--color-status-yellow)"
        opacity="0.2"
        strokeWidth="1.6"
      />
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
      <path d="M5 8h6" stroke="var(--color-status-gray)" strokeWidth="1.6" strokeLinecap="round" />
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
  const percent = relevant > 0 ? (passed / relevant) * 100 : 0;
  const tone = summaryProgressTone(passed, failed, pending);

  return (
    <Card padding="sm" className="space-y-2">
      <LinearProgress value={percent} tone={tone} />
      <div className="flex flex-wrap items-center gap-2">
        {passed > 0 && (
          <Pill tone="success" data-check-count="passed" icon={<CheckIcon />}>
            {passed} passed
          </Pill>
        )}
        {failed > 0 && (
          <Pill tone="error" data-check-count="failed" icon={<FailIcon />}>
            {failed} failed
          </Pill>
        )}
        {pending > 0 && (
          <Pill tone="warning" data-check-count="pending" icon={<SpinnerIcon />}>
            {pending} in progress
          </Pill>
        )}
        {skipped > 0 && (
          <Pill tone="neutral" data-check-count="skipped" icon={<SkipIcon />}>
            {skipped} skipped
          </Pill>
        )}
      </div>
    </Card>
  );
}

/* ── Main component ────────────────────────────────── */

export function ChecksTab({ checks, pr }: ChecksTabProps) {
  const { fixWithClaude } = useClaudeActions();

  const handleFixCheck = useCallback(
    (checkName: string) => {
      if (!pr) return;
      fixWithClaude(pr, [checkName], [], [], '').catch((err) =>
        console.error('Fix with Claude failed:', err),
      );
    },
    [pr, fixWithClaude],
  );

  if (checks.length === 0) {
    return (
      <Card padding="md" className="m-3 flex items-center justify-center gap-2">
        <svg
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.3"
        >
          <path d="m3 8.5 3.5 3.5 6.5-8" />
        </svg>
        <span className="text-xs text-[var(--color-text-muted)]">No CI checks configured</span>
      </Card>
    );
  }

  const grouped = groupBySuite(checks);

  // Sort: failed suites first, then pending, then passed, then skipped
  const sortOrder: Record<CheckState, number> = { failed: 0, pending: 1, passed: 2, skipped: 3 };
  const sortedEntries = [...grouped.entries()].sort(
    ([, a], [, b]) => sortOrder[suiteStatus(a)] - sortOrder[suiteStatus(b)],
  );

  return (
    <div className="space-y-3 p-3" data-checks-tab="">
      <SummaryBar checks={checks} />

      <div className="space-y-2">
        {sortedEntries.map(([suiteId, runs]) => {
          // Sort within suite: failed first
          const sortedRuns = [...runs].sort(
            (a, b) => sortOrder[classifyCheck(a)] - sortOrder[classifyCheck(b)],
          );

          return (
            <div key={suiteId} className="space-y-1">
              {sortedRuns.map((run) => {
                const state = classifyCheck(run);
                const duration = formatDuration(run.startedAt, run.completedAt);

                return (
                  <div
                    key={run.id}
                    data-check-row=""
                    data-check-state={state}
                    role="button"
                    tabIndex={0}
                    onClick={() => openUrl(run.htmlUrl).catch(console.error)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openUrl(run.htmlUrl).catch(console.error);
                    }}
                    className={clsx(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                      'hover:bg-[var(--color-surface-hover)]',
                      state === 'failed' &&
                        'bg-[color-mix(in_srgb,var(--color-status-red)_5%,transparent)]',
                    )}
                  >
                    <StatusSvg state={state} />
                    <span
                      className={clsx(
                        'flex-1 truncate text-xs',
                        state === 'failed'
                          ? 'text-[var(--color-status-red)]'
                          : 'text-[var(--color-text-primary)]',
                        state === 'skipped' && 'text-[var(--color-text-muted)]',
                      )}
                    >
                      {run.name}
                    </span>
                    {state === 'pending' && <Pill tone="warning">running</Pill>}
                    {duration && (
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {duration}
                      </span>
                    )}
                    {state === 'failed' && pr && (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-check-action="fix"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFixCheck(run.name);
                        }}
                        leading={
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 1.5Z" />
                          </svg>
                        }
                      >
                        Fix
                      </Button>
                    )}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="m6 4 4 4-4 4" />
                    </svg>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
