import clsx from 'clsx';

export type TrackingFilter = 'all' | 'tracked' | 'workingOn';

interface WorkItemFilterBarProps {
  states: string[];
  assignees: string[];
  selectedState: string;
  selectedAssignee: string;
  trackingFilter: TrackingFilter;
  trackedCount: number;
  workingOnCount: number;
  onStateChange: (state: string) => void;
  onAssigneeChange: (assignee: string) => void;
  onTrackingFilterChange: (filter: TrackingFilter) => void;
  onRefresh: () => void;
  onOpenQueryBrowser: () => void;
  selectedQueryName?: string;
}

export function WorkItemFilterBar({
  states,
  assignees,
  selectedState,
  selectedAssignee,
  trackingFilter,
  trackedCount,
  workingOnCount,
  onStateChange,
  onAssigneeChange,
  onTrackingFilterChange,
  onRefresh,
  onOpenQueryBrowser,
  selectedQueryName,
}: WorkItemFilterBarProps) {
  return (
    <div className="space-y-2 border-b border-[var(--color-subtle-border)] px-3 py-2.5">
      {/* Query selector + refresh */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenQueryBrowser}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-left text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-strong-border)]"
        >
          <svg
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M5 6h6M5 9h4" />
          </svg>
          <span className="truncate">{selectedQueryName || 'Select a query...'}</span>
          <svg
            className="ml-auto h-3 w-3 shrink-0 text-[var(--color-text-ghost)]"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
          title="Refresh"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              d="M2 8a6 6 0 0110.9-3.5M14 2v4h-4M14 8a6 6 0 01-10.9 3.5M2 14v-4h4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2">
        {/* State filter */}
        <select
          value={selectedState}
          onChange={(e) => onStateChange(e.target.value)}
          className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-[12px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="All">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Assigned To filter */}
        <select
          value={selectedAssignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-[12px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="Anyone">Anyone</option>
          <option value="@Me">@Me</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Tracking pills */}
        <div className="flex gap-1">
          <button
            onClick={() => onTrackingFilterChange('all')}
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
              trackingFilter === 'all'
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
            )}
          >
            All
          </button>
          <button
            onClick={() => onTrackingFilterChange('tracked')}
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
              trackingFilter === 'tracked'
                ? 'bg-[var(--color-tracked-border)] text-white'
                : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
            )}
          >
            Tracked
            {trackedCount > 0 && <span className="ml-1 opacity-75">{trackedCount}</span>}
          </button>
          <button
            onClick={() => onTrackingFilterChange('workingOn')}
            className={clsx(
              'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
              trackingFilter === 'workingOn'
                ? 'bg-[var(--color-working-on-border)] text-white'
                : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
            )}
          >
            Working
            {workingOnCount > 0 && <span className="ml-1 opacity-75">{workingOnCount}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
