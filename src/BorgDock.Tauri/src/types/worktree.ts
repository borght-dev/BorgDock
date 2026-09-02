export type WorktreeStatus = 'clean' | 'dirty' | 'conflict';

export interface WorktreeInfo {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
  status: WorktreeStatus;
  uncommittedCount: number;
  ahead: number;
  behind: number;
  commitSha: string;
}

/** Lightweight entry from `git worktree list --porcelain` (no status scan). */
export interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

/** One repo's slice of the Rust-side worktree cache (`git::worktree_cache`). */
export interface WorktreeCacheRepo {
  repo: { owner: string; name: string; basePath: string };
  /** Sorted by Rust: main worktree first, then natural path order. */
  entries: WorktreeEntry[];
  /** Unix epoch ms of the scan that produced `entries`. */
  fetchedAt: number;
  /** Present when the last scan failed; `entries` is the previous good result. */
  error?: string;
}

/**
 * Payload of `worktree_cache_get_all` / `worktree_cache_refresh` and of the
 * `worktrees-updated` event broadcast to every window after a refresh.
 */
export type WorktreeSnapshot = WorktreeCacheRepo[];

export const WORKTREES_UPDATED_EVENT = 'worktrees-updated';
