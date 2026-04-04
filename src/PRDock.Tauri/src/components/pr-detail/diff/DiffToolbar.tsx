import clsx from 'clsx';
import type { DiffViewMode, FileStatusFilter } from '@/types';
import type { PullRequestCommit } from '@/types';

interface DiffToolbarProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  showFileTree: boolean;
  onToggleFileTree: () => void;
  allExpanded: boolean;
  onToggleAllExpanded: () => void;
  statusFilter: FileStatusFilter;
  onStatusFilterChange: (filter: FileStatusFilter) => void;
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
  commits: PullRequestCommit[];
  selectedCommit: string | null;
  onCommitChange: (sha: string | null) => void;
}

const statusFilters: { value: FileStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'added', label: 'Added' },
  { value: 'modified', label: 'Modified' },
  { value: 'deleted', label: 'Deleted' },
];

export function DiffToolbar({
  viewMode,
  onViewModeChange,
  showFileTree,
  onToggleFileTree,
  allExpanded,
  onToggleAllExpanded,
  statusFilter,
  onStatusFilterChange,
  fileCount,
  totalAdditions,
  totalDeletions,
  commits,
  selectedCommit,
  onCommitChange,
}: DiffToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[var(--color-diff-border)] bg-[var(--color-diff-file-header-bg)]">
      {/* View mode toggle */}
      <div className="flex rounded-md border border-[var(--color-subtle-border)] overflow-hidden">
        <button
          onClick={() => onViewModeChange('unified')}
          className={clsx(
            'px-2 py-0.5 text-[10px] font-medium transition-colors',
            viewMode === 'unified'
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          Unified
        </button>
        <button
          onClick={() => onViewModeChange('split')}
          className={clsx(
            'px-2 py-0.5 text-[10px] font-medium transition-colors',
            viewMode === 'split'
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          Split
        </button>
      </div>

      {/* File tree toggle */}
      <button
        onClick={onToggleFileTree}
        className={clsx(
          'p-1 rounded-md transition-colors',
          showFileTree
            ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
            : 'text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)]',
        )}
        title={showFileTree ? 'Hide file tree' : 'Show file tree'}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 3h12M2 8h8M2 13h10" />
        </svg>
      </button>

      {/* Expand/collapse all */}
      <button
        onClick={onToggleAllExpanded}
        className="p-1 rounded-md text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
        title={allExpanded ? 'Collapse all' : 'Expand all'}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {allExpanded ? (
            <>
              <path d="M4 6l4-4 4 4" />
              <path d="M4 10l4 4 4-4" />
            </>
          ) : (
            <>
              <path d="M4 4l4 4 4-4" />
              <path d="M4 8l4 4 4-4" />
            </>
          )}
        </svg>
      </button>

      {/* Status filter chips */}
      <div className="flex gap-1">
        {statusFilters.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onStatusFilterChange(value)}
            className={clsx(
              'px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors',
              statusFilter === value
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
        {fileCount} file{fileCount !== 1 ? 's' : ''},{' '}
        <span className="text-[var(--color-status-green)]">+{totalAdditions}</span>{' '}
        <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
      </span>

      {/* Commit scope selector */}
      {commits.length > 0 && (
        <select
          value={selectedCommit ?? ''}
          onChange={(e) => onCommitChange(e.target.value || null)}
          className="text-[10px] rounded border border-[var(--color-input-border)] bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] px-1.5 py-0.5 outline-none max-w-[180px]"
        >
          <option value="">All changes</option>
          {commits.map((c) => (
            <option key={c.sha} value={c.sha}>
              {c.sha.slice(0, 7)} — {c.message.split('\n')[0]?.slice(0, 50)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
