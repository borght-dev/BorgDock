import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, IconButton, LinearProgress, Pill } from '@/components/shared/primitives';
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

function pillTone(status: WorktreeStatus): 'success' | 'draft' | 'error' {
  switch (status) {
    case 'open':
      return 'success';
    case 'closed':
      return 'draft';
    case 'orphaned':
      return 'error';
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="prune-dialog-title"
          className="pointer-events-auto flex max-h-[80vh] w-full max-w-lg flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <Card variant="default" padding="sm" className="flex h-full flex-col p-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-separator)] px-5 py-3.5">
            <h2
              id="prune-dialog-title"
              className="text-sm font-semibold text-[var(--color-text-primary)]"
            >
              Prune Worktrees
            </h2>
            <IconButton
              size={22}
              onClick={onClose}
              aria-label="Close"
              icon={
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              }
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-[var(--color-separator)] px-5 py-2.5">
            <Button variant="secondary" size="sm" onClick={selectAllOrphaned}>
              Select all orphaned
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              Deselect all
            </Button>
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
                        <Pill tone={pillTone(row.status)}>{statusLabel(row.status)}</Pill>
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
                <LinearProgress
                  value={removeTotal > 0 ? (removeProgress / removeTotal) * 100 : 0}
                  tone="accent"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={selectedCount === 0 || isRemoving}
                onClick={removeSelected}
              >
                Remove selected ({selectedCount})
              </Button>
            </div>
          </div>
          </Card>
        </div>
      </div>
    </>
  );
}
