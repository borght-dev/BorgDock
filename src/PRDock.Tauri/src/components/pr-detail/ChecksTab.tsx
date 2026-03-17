import clsx from 'clsx';
import type { CheckRun } from '@/types';

interface ChecksTabProps {
  checks: CheckRun[];
}

function statusIcon(conclusion?: string, status?: string): { icon: string; color: string } {
  if (status === 'in_progress' || status === 'queued') {
    return { icon: '\u25F7', color: 'var(--color-status-yellow)' }; // clock
  }
  switch (conclusion) {
    case 'success':
      return { icon: '\u2713', color: 'var(--color-status-green)' };
    case 'failure':
    case 'timed_out':
      return { icon: '\u2717', color: 'var(--color-status-red)' };
    case 'cancelled':
    case 'skipped':
      return { icon: '\u2014', color: 'var(--color-status-gray)' };
    default:
      return { icon: '\u25CB', color: 'var(--color-status-gray)' };
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

export function ChecksTab({ checks }: ChecksTabProps) {
  if (checks.length === 0) {
    return (
      <p className="p-3 text-xs text-[var(--color-text-muted)]">No checks found.</p>
    );
  }

  const grouped = groupBySuite(checks);

  return (
    <div className="divide-y divide-[var(--color-separator)]">
      {[...grouped.entries()].map(([suiteId, runs]) => (
        <div key={suiteId} className="py-1">
          {runs.map((run) => {
            const { icon, color } = statusIcon(run.conclusion, run.status);
            const duration = formatDuration(run.startedAt, run.completedAt);
            const isFailed = run.conclusion === 'failure' || run.conclusion === 'timed_out';
            const isPassed = run.conclusion === 'success';

            return (
              <a
                key={run.id}
                href={run.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] transition-colors rounded-md mx-1',
                  isFailed && 'bg-[var(--color-check-failed-bg)]',
                  isPassed && 'bg-[var(--color-check-passed-bg)]',
                )}
              >
                <span className="shrink-0 text-sm" style={{ color }}>
                  {icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
                  {run.name}
                </span>
                {duration && (
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                    {duration}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}
