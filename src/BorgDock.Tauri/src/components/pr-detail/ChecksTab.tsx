import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  CircleX,
  LoaderCircle,
  Plus,
} from 'lucide-react';
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

type CheckState = 'passed' | 'failed' | 'pending' | 'skipped' | 'cancelled';

function classifyCheck(run: CheckRun): CheckState {
  if (run.status === 'in_progress' || run.status === 'queued') return 'pending';
  switch (run.conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'timed_out':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
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
  if (runs.every((r) => classifyCheck(r) === 'cancelled')) return 'cancelled';
  if (
    runs.every((r) => {
      const s = classifyCheck(r);
      return s === 'skipped' || s === 'cancelled';
    })
  )
    return 'skipped';
  return 'passed';
}

function summaryProgressTone(passed: number, failed: number, pending: number): LinearProgressTone {
  if (failed > 0) return 'error';
  if (pending > 0) return 'warning';
  if (passed > 0) return 'success';
  return 'accent';
}

/* ── Status icons ──────────────────────────────────── */

const PASSED_ICON = <CircleCheck size={14} strokeWidth={2.4} color="var(--color-status-green)" />;
const FAILED_ICON = <CircleX size={14} strokeWidth={2.4} color="var(--color-status-red)" />;
const PENDING_ICON = (
  <LoaderCircle
    size={14}
    strokeWidth={2.4}
    color="var(--color-status-yellow)"
    className="animate-spin"
  />
);
const SKIPPED_ICON = <CircleMinus size={14} strokeWidth={2.4} color="var(--color-status-gray)" />;
const CANCELLED_ICON = <CircleSlash size={14} strokeWidth={2.4} color="var(--color-status-gray)" />;

function StatusSvg({ state }: { state: CheckState }) {
  switch (state) {
    case 'passed':
      return PASSED_ICON;
    case 'failed':
      return FAILED_ICON;
    case 'pending':
      return PENDING_ICON;
    case 'skipped':
      return SKIPPED_ICON;
    case 'cancelled':
      return CANCELLED_ICON;
  }
}

/* ── Summary bar ───────────────────────────────────── */

function SummaryBar({ checks }: { checks: CheckRun[] }) {
  const passed = checks.filter((c) => classifyCheck(c) === 'passed').length;
  const failed = checks.filter((c) => classifyCheck(c) === 'failed').length;
  const pending = checks.filter((c) => classifyCheck(c) === 'pending').length;
  const skipped = checks.filter((c) => classifyCheck(c) === 'skipped').length;
  const cancelled = checks.filter((c) => classifyCheck(c) === 'cancelled').length;
  const total = checks.length;
  const relevant = total - skipped - cancelled;
  const percent = relevant > 0 ? (passed / relevant) * 100 : 0;
  const tone = summaryProgressTone(passed, failed, pending);

  return (
    <Card padding="sm" className="space-y-2">
      <LinearProgress value={percent} tone={tone} />
      <div className="flex flex-wrap items-center gap-2">
        {passed > 0 && (
          <Pill tone="success" data-check-count="passed" icon={PASSED_ICON}>
            {passed} passed
          </Pill>
        )}
        {failed > 0 && (
          <Pill tone="error" data-check-count="failed" icon={FAILED_ICON}>
            {failed} failed
          </Pill>
        )}
        {pending > 0 && (
          <Pill tone="warning" data-check-count="pending" icon={PENDING_ICON}>
            {pending} in progress
          </Pill>
        )}
        {skipped > 0 && (
          <Pill tone="neutral" data-check-count="skipped" icon={SKIPPED_ICON}>
            {skipped} skipped
          </Pill>
        )}
        {cancelled > 0 && (
          <Pill tone="neutral" data-check-count="cancelled" icon={CANCELLED_ICON}>
            {cancelled} cancelled
          </Pill>
        )}
      </div>
    </Card>
  );
}

/* ── Check row ─────────────────────────────────────── */

interface CheckRowProps {
  run: CheckRun;
  state: CheckState;
  onFixClick?: (name: string) => void;
}

function CheckRow({ run, state, onFixClick }: CheckRowProps) {
  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <div
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
        state === 'failed' && 'bg-[color-mix(in_srgb,var(--color-status-red)_5%,transparent)]',
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
      {duration && <span className="text-[10px] text-[var(--color-text-muted)]">{duration}</span>}
      {state === 'failed' && onFixClick && (
        <Button
          variant="ghost"
          size="sm"
          data-check-action="fix"
          onClick={(e) => {
            e.stopPropagation();
            onFixClick(run.name);
          }}
          leading={<Plus size={10} strokeWidth={3} />}
        >
          Fix
        </Button>
      )}
      <ChevronRight size={10} strokeWidth={2.25} />
    </div>
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
        <Check size={20} strokeWidth={1.5} opacity={0.3} />
        <span className="text-xs text-[var(--color-text-muted)]">No CI checks configured</span>
      </Card>
    );
  }

  const pendingRuns = checks.filter((c) => classifyCheck(c) === 'pending');
  const sortOrder: Record<CheckState, number> = {
    failed: 0,
    pending: 1,
    passed: 2,
    cancelled: 3,
    skipped: 4,
  };
  const grouped = groupBySuite(checks);
  const sortedEntries = [...grouped.entries()].sort(
    ([, a], [, b]) => sortOrder[suiteStatus(a)] - sortOrder[suiteStatus(b)],
  );

  return (
    <div className="space-y-3 p-3" data-checks-tab="">
      <SummaryBar checks={checks} />

      {pendingRuns.length > 0 && (
        <div data-checks-section="pending" className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex text-[var(--color-status-yellow)]">{PENDING_ICON}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              In progress · {pendingRuns.length}
            </span>
          </div>
          <Card padding="sm" className="overflow-hidden border border-[var(--color-status-yellow)]">
            {pendingRuns.map((run) => (
              <CheckRow key={run.id} run={run} state={classifyCheck(run)} />
            ))}
          </Card>
        </div>
      )}

      <div className="space-y-2" data-checks-section="all">
        {sortedEntries.map(([suiteId, runs]) => {
          const sortedRuns = [...runs].sort(
            (a, b) => sortOrder[classifyCheck(a)] - sortOrder[classifyCheck(b)],
          );
          return (
            <div key={suiteId} className="space-y-1">
              {sortedRuns.map((run) => {
                const state = classifyCheck(run);
                const onFixClick = pr ? (name: string) => handleFixCheck(name) : undefined;
                return <CheckRow key={run.id} run={run} state={state} onFixClick={onFixClick} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
