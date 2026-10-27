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

/**
 * The worktree for `branch` under the repo's worktree base: the one already
 * checked out, or a new one in `subfolder`.
 */
export async function ensureWorktree(
  repo: { worktreeBasePath?: string; worktreeSubfolder?: string; owner: string; name: string },
  branch: string,
): Promise<string> {
  if (!repo.worktreeBasePath) {
    throw new Error(
      `No worktree base path configured for ${repo.owner}/${repo.name}. Configure it in Settings → Repos.`,
    );
  }
  const existing = await findWorktreeForBranch(repo.worktreeBasePath, branch);
  if (existing) return existing.path;
  return invoke<string>('create_worktree', {
    basePath: repo.worktreeBasePath,
    subfolder: repo.worktreeSubfolder || '.worktrees',
    branchName: branch,
  });
}
