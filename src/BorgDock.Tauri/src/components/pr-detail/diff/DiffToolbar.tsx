import { ChevronsDownUp, ChevronsUpDown, ListTree } from 'lucide-react';
import { Button, Chip, IconButton } from '@/components/shared/primitives';
import type { DiffViewMode, FileStatusFilter, PullRequestCommit } from '@/types';

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
  onSubmitReview?: () => void;
}

const STATUS_FILTERS = ['all', 'added', 'modified', 'deleted'] as const;

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
  onSubmitReview,
}: DiffToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--color-diff-border)] bg-[var(--color-diff-file-header-bg)] px-3 py-1.5"
      data-diff-toolbar
    >
      <div className="flex gap-1">
        <Chip
          active={viewMode === 'unified'}
          onClick={() => onViewModeChange('unified')}
          data-diff-view-mode="unified"
        >
          Unified
        </Chip>
        <Chip
          active={viewMode === 'split'}
          onClick={() => onViewModeChange('split')}
          data-diff-view-mode="split"
        >
          Split
        </Chip>
      </div>

      <IconButton
        icon={<ListTree size={12} strokeWidth={2.25} aria-hidden="true" />}
        active={showFileTree}
        tooltip={showFileTree ? 'Hide file tree' : 'Show file tree'}
        size={22}
        onClick={onToggleFileTree}
        data-diff-toolbar-action="file-tree"
      />

      <IconButton
        icon={
          allExpanded ? (
            <ChevronsDownUp size={12} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <ChevronsUpDown size={12} strokeWidth={2.25} aria-hidden="true" />
          )
        }
        active={allExpanded}
        tooltip={allExpanded ? 'Collapse all' : 'Expand all'}
        size={22}
        onClick={onToggleAllExpanded}
        data-diff-toolbar-action="expand-collapse"
      />

      <div className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f}
            active={statusFilter === f}
            onClick={() => onStatusFilterChange(f)}
            data-diff-filter={f}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </div>

      <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
        {fileCount} file{fileCount !== 1 ? 's' : ''},{' '}
        <span className="text-[var(--color-status-green)]">+{totalAdditions}</span>{' '}
        <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
      </span>

      {commits.length > 0 && (
        <select
          value={selectedCommit ?? ''}
          onChange={(e) => onCommitChange(e.target.value || null)}
          className="max-w-[180px] rounded border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent)]"
          data-diff-commit-selector
        >
          <option value="">All changes</option>
          {commits.map((c) => (
            <option key={c.sha} value={c.sha}>
              {c.sha.slice(0, 7)} — {c.message.split('\n')[0]?.slice(0, 50)}
            </option>
          ))}
        </select>
      )}

      {onSubmitReview && (
        <>
          <span className="mx-1 inline-block h-[18px] w-px bg-[var(--color-subtle-border)]" />
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmitReview}
            data-files-action="submit-review"
          >
            Submit review
          </Button>
        </>
      )}
    </div>
  );
}
