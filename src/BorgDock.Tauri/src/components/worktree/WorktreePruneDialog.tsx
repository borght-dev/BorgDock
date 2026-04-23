import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorktreeInfo } from '@/types';

interface WorktreePruneDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type WorktreeStatus = 'open' | 'closed' | 'orphaned';

interface WorktreeRow {
  worktree: WorktreeInfo;
  repoKey: string;
  basePath: string;
  status: WorktreeStatus;
  isSelected: boolean;
}

function statusLabel(status: WorktreeStatus): string {
  switch (status) {
    case 'open':
      return 'Open PR';
    case 'closed':
      return 'Closed';
    case 'orphaned':
      return 'Orphaned';
  }
}

function statusClasses(status: WorktreeStatus): string {
  switch (status) {
    case 'open':
      return 'bg-[var(--color-success-badge-bg)] text-[var(--color-success-badge-fg)] border border-[var(--color-success-badge-border)]';
    case 'closed':
      return 'bg-[var(--color-draft-badge-bg)] text-[var(--color-draft-badge-fg)] border border-[var(--color-draft-badge-border)]';
    case 'orphaned':
      return 'bg-[var(--color-error-badge-bg)] text-[var(--color-error-badge-fg)] border border-[var(--color-error-badge-border)]';
  }
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  return `...${path.slice(-(maxLen - 3))}`;
}

export function WorktreePruneDialog({ isOpen, onClose }: WorktreePruneDialogProps) {
  const settings = useSettingsStore((s) => s.settings);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);

  const [rows, setRows] = useState<WorktreeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeProgress, setRemoveProgress] = useState(0);
  const [removeTotal, setRemoveTotal] = useState(0);
  const [error, setError] = useState('');

  // Refs carry the latest PR + repo data into loadWorktrees without
  // causing it to recompute on every render — the previous version built
  // fresh `Set`s at the top of the component, those fed `classifyWorktree`'s
  // deps, which fed `loadWorktrees`' deps, which fed the effect's deps, and
  // the effect called setState → re-render → new Sets → infinite loop.
  // (The dialog is rendered unconditionally inside SettingsFlyout, so this
  // loop fired for every settings keystroke, preventing password persistence
  // by continuously resetting the store's debounce timer.)
  const prsRef = useRef(pullRequests);
  prsRef.current = pullRequests;
  const closedRef = useRef(closedPullRequests);
  closedRef.current = closedPullRequests;
  const reposRef = useRef(settings.repos);
  reposRef.current = settings.repos;

  const classifyWorktree = useCallback(
    (
      branchName: string,
      openBranches: Set<string>,
      closedBranches: Set<string>,
    ): WorktreeStatus => {
      const shortName = branchName.replace(/^refs\/heads\//, '');
      if (openBranches.has(shortName) || openBranches.has(branchName)) return 'open';
      if (closedBranches.has(shortName) || closedBranches.has(branchName)) return 'closed';
      return 'orphaned';
    },
    [],
  );

  const loadWorktrees = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const allRows: WorktreeRow[] = [];
    const openBranches = new Set(prsRef.current.map((pr) => pr.pullRequest.headRef));
    const closedBranches = new Set(closedRef.current.map((pr) => pr.pullRequest.headRef));

    for (const repo of reposRef.current) {
      if (!repo.worktreeBasePath) continue;

      try {
        const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', {
          basePath: repo.worktreeBasePath,
        });

        for (const wt of worktrees) {
          if (wt.isMainWorktree) continue;
          const status = classifyWorktree(wt.branchName, openBranches, closedBranches);
          allRows.push({
            worktree: wt,
            repoKey: `${repo.owner}/${repo.name}`,
            basePath: repo.worktreeBasePath,
            status,
            isSelected: false,
          });
        }
      } catch (err) {
        console.error(`Failed to list worktrees for ${repo.owner}/${repo.name}:`, err);
      }
    }

    setRows(allRows);
    setIsLoading(false);
  }, [classifyWorktree]);

  useEffect(() => {
    if (isOpen) {
      void loadWorktrees();
    } else {
      // Only clear state if there's something to clear — setRows([]) with a
      // fresh array reference would otherwise trigger a re-render even when
      // the component was already empty.
      setRows((prev) => (prev.length === 0 ? prev : []));
      setRemoveProgress(0);
      setRemoveTotal(0);
      setError('');
    }
  }, [isOpen, loadWorktrees]);

  const toggleRow = useCallback((index: number) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, isSelected: !r.isSelected } : r)));
  }, []);

  const selectAllOrphaned = useCallback(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isSelected: r.status === 'orphaned' || r.status === 'closed',
      })),
    );
  }, []);

  const deselectAll = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, isSelected: false })));
  }, []);

  const selectedCount = rows.filter((r) => r.isSelected).length;

  const removeSelected = useCallback(async () => {
    const toRemove = rows.filter((r) => r.isSelected);
    if (toRemove.length === 0) return;

    setIsRemoving(true);
    setRemoveProgress(0);
    setRemoveTotal(toRemove.length);
    setError('');

    let successCount = 0;
    const failedPaths: string[] = [];

    for (let i = 0; i < toRemove.length; i++) {
      const row = toRemove[i]!;
      try {
        await invoke('remove_worktree', {
          basePath: row.basePath,
          worktreePath: row.worktree.path,
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to remove worktree ${row.worktree.path}:`, err);
        failedPaths.push(row.worktree.path);
      }
      setRemoveProgress(i + 1);
    }

    setIsRemoving(false);

    if (failedPaths.length > 0) {
      setError(`Failed to remove ${failedPaths.length} worktree(s).`);
    }

    if (successCount > 0) {
      // Reload to reflect changes
      await loadWorktrees();
    }
  }, [rows, loadWorktrees]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-separator)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Prune Worktrees
            </h2>
            <button
              className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
              onClick={onClose}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-[var(--color-separator)] px-5 py-2.5">
            <button
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-subtle)] hover:opacity-80 transition-opacity"
              onClick={selectAllOrphaned}
            >
              Select all orphaned
            </button>
            <button
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
              onClick={deselectAll}
            >
              Deselect all
            </button>
            <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
              {rows.length} worktree{rows.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
              </div>
            )}

            {!isLoading && rows.length === 0 && (
              <div className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">
                No worktrees found. Configure worktree base paths in Settings &rarr; Repos.
              </div>
            )}

            {!isLoading && rows.length > 0 && (
              <div className="space-y-1.5">
                {rows.map((row, index) => (
                  <label
                    key={row.worktree.path}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                      row.isSelected
                        ? 'bg-[var(--color-selected-row-bg)]'
                        : 'hover:bg-[var(--color-surface-hover)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={row.isSelected}
                      onChange={() => toggleRow(index)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-medium text-[var(--color-text-primary)]">
                          {row.worktree.branchName.replace(/^refs\/heads\//, '')}
                        </span>
                        <span
                          className={clsx(
                            'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                            statusClasses(row.status),
                          )}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 text-[11px] text-[var(--color-text-muted)]"
                        title={row.worktree.path}
                      >
                        {truncatePath(row.worktree.path)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--color-separator)] px-5 py-3.5">
            {error && <p className="mb-2 text-[11px] text-[var(--color-status-red)]">{error}</p>}

            {isRemoving && (
              <div className="mb-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                  <span>Removing worktrees...</span>
                  <span>
                    {removeProgress}/{removeTotal}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{
                      width: removeTotal > 0 ? `${(removeProgress / removeTotal) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
                onClick={onClose}
              >
                Close
              </button>
              <button
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity',
                  selectedCount > 0
                    ? 'bg-[var(--color-action-danger-bg)] text-[var(--color-action-danger-fg)] hover:opacity-80'
                    : 'bg-[var(--color-surface-raised)] text-[var(--color-text-ghost)] cursor-not-allowed',
                )}
                disabled={selectedCount === 0 || isRemoving}
                onClick={removeSelected}
              >
                Remove selected ({selectedCount})
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
