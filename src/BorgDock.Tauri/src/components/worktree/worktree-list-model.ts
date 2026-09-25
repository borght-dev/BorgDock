import type { WorktreeCacheRepo, WorktreeEntry, WorktreeSnapshot } from '@/types/worktree';

/**
 * Pure helpers behind `WorktreeList`: flattening the Rust cache snapshot into
 * rows, ordering, filtering and grouping. Shared by the worktrees tool window
 * and the main window's Worktrees section.
 */

export type WorktreeRepoRef = WorktreeCacheRepo['repo'];

/**
 * Key hints for the status bar while the Worktrees section is showing
 * (`useStatusBar` adds "/ search · R refresh" in front in the rail layout).
 */
export const WORKTREES_STATUS_HINT =
  'J K move · Enter changes · T T3 · O terminal · F favourite · Ctrl+F7 window';

/** One row of the list: a worktree and the repository it belongs to. */
export interface WorktreeListEntry {
  wt: WorktreeEntry;
  repo: WorktreeRepoRef;
}

export function folderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? fullPath;
}

export function parentFolder(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
}

export function repoDisplayName(repo: WorktreeRepoRef): string {
  return repo.remote
    ? `${repo.remote.label || repo.remote.sshTarget} · ${repo.owner}/${repo.name}`
    : `${repo.owner}/${repo.name}`;
}

/** Branch name without a `refs/heads/` prefix. */
export function shortBranch(branchName: string): string {
  return branchName.replace(/^refs\/heads\//, '');
}

/**
 * Stable identity of a row: the path, prefixed with the remote id for
 * worktrees fetched over SSH (the same path can exist on two machines).
 * Also the key favourites are stored under and the `data-key` FLIP follows.
 */
export function worktreeKey(repo: WorktreeRepoRef, path: string): string {
  return repo.remote ? `remote:${repo.remote.id}:${path}` : path;
}

export function matchesQuery(entry: WorktreeListEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const folder = folderName(entry.wt.path).toLowerCase();
  const branch = entry.wt.branchName.toLowerCase();
  const repo = repoDisplayName(entry.repo).toLowerCase();
  return branch.includes(lower) || folder.includes(lower) || repo.includes(lower);
}

/** Numeric-aware, case-insensitive: worktree2 < worktree10, Foo ~ foo. */
export function compareFolderNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * List order: repo → main worktree pinned first → folder name (numeric).
 * Favorites are marked with a star but deliberately NOT hoisted — a stable
 * folder order is what makes "worktree7" findable at a glance.
 */
export function compareFlatEntries(a: WorktreeListEntry, b: WorktreeListEntry): number {
  const repoCmp = repoDisplayName(a.repo).localeCompare(repoDisplayName(b.repo));
  if (repoCmp !== 0) return repoCmp;
  const mainCmp = Number(b.wt.isMainWorktree) - Number(a.wt.isMainWorktree);
  if (mainCmp !== 0) return mainCmp;
  return compareFolderNames(folderName(a.wt.path), folderName(b.wt.path));
}

/** Flatten a cache snapshot into rows + per-repo error map. */
export function flattenSnapshot(snapshot: WorktreeSnapshot): {
  entries: WorktreeListEntry[];
  errors: Map<string, string>;
} {
  const entries: WorktreeListEntry[] = [];
  const errors = new Map<string, string>();
  for (const repo of snapshot) {
    for (const wt of repo.entries) entries.push({ wt, repo: repo.repo });
    if (repo.error) errors.set(repoDisplayName(repo.repo), repo.error);
  }
  return { entries, errors };
}

export function groupByRepo(entries: WorktreeListEntry[]): Map<string, WorktreeListEntry[]> {
  const groups = new Map<string, WorktreeListEntry[]>();
  for (const e of entries) {
    const key = repoDisplayName(e.repo);
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

/**
 * Rows to show: those matching `query`, in list order. Favorites-only hides
 * everything that is not a favorite except the main worktree, which anchors
 * its repo group.
 */
export function visibleEntries(
  entries: WorktreeListEntry[],
  query: string,
  favoritesOnly: boolean,
  favoriteKeys: ReadonlySet<string>,
): WorktreeListEntry[] {
  const visible = entries.filter((e) => {
    if (!matchesQuery(e, query)) return false;
    if (
      favoritesOnly &&
      !favoriteKeys.has(worktreeKey(e.repo, e.wt.path)) &&
      !e.wt.isMainWorktree
    ) {
      return false;
    }
    return true;
  });
  visible.sort(compareFlatEntries);
  return visible;
}
