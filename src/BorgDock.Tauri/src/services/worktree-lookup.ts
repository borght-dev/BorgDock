import { invoke } from '@tauri-apps/api/core';
import type { WorktreeEntry } from '@/types/worktree';

/**
 * Find the non-main worktree that already has `branch` checked out, using the
 * cheap `git worktree list --porcelain` path (no status scan). Returns `null`
 * when the branch is not checked out anywhere under `basePath`.
 */
export async function findWorktreeForBranch(
  basePath: string,
  branch: string,
): Promise<WorktreeEntry | null> {
  const worktrees = await invoke<WorktreeEntry[]>('list_worktrees_bare', { basePath });
  const lower = branch.toLowerCase();
  return (
    worktrees.find((w) => {
      if (w.isMainWorktree) return false;
      const name = w.branchName.toLowerCase();
      return name === lower || name === `refs/heads/${lower}`;
    }) ?? null
  );
}
