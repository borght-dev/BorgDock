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

/** Host id of this machine, the same id `host_disk_space` measures it under. */
export const LOCAL_HOST_ID = 'local';

/** The machine a repository's worktrees live on: this one, or its SSH target. */
export function hostIdOf(repo: WorktreeRepoRef): string {
  return repo.remote ? repo.remote.sshTarget.trim() : LOCAL_HOST_ID;
}

/** A remote host's name; empty for this machine, which the disk probe names. */
export function hostLabelOf(repo: WorktreeRepoRef): string {
  return repo.remote ? repo.remote.label.trim() || repo.remote.sshTarget.trim() : '';
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

function compareHosts(a: WorktreeRepoRef, b: WorktreeRepoRef): number {
  return (
    Number(Boolean(a.remote)) - Number(Boolean(b.remote)) ||
    hostLabelOf(a).localeCompare(hostLabelOf(b)) ||
    hostIdOf(a).localeCompare(hostIdOf(b))
  );
}

/**
 * List order: host (this machine first) → repo → main worktree pinned first
 * → folder name (numeric). Favorites are marked with a star but deliberately
 * NOT hoisted — a stable folder order is what makes "worktree7" findable at
 * a glance.
 */
export function compareFlatEntries(a: WorktreeListEntry, b: WorktreeListEntry): number {
  const hostCmp = compareHosts(a.repo, b.repo);
  if (hostCmp !== 0) return hostCmp;
  const repoCmp = repoDisplayName(a.repo).localeCompare(repoDisplayName(b.repo));
  if (repoCmp !== 0) return repoCmp;
  const mainCmp = Number(b.wt.isMainWorktree) - Number(a.wt.isMainWorktree);
  if (mainCmp !== 0) return mainCmp;
  return compareFolderNames(folderName(a.wt.path), folderName(b.wt.path));
}

/** A repository whose last scan failed, keyed in `flattenSnapshot` by its display name. */
export interface WorktreeRepoError {
  repo: WorktreeRepoRef;
  message: string;
}

/** Flatten a cache snapshot into rows + per-repo error map. */
export function flattenSnapshot(snapshot: WorktreeSnapshot): {
  entries: WorktreeListEntry[];
  errors: Map<string, WorktreeRepoError>;
} {
  const entries: WorktreeListEntry[] = [];
  const errors = new Map<string, WorktreeRepoError>();
  for (const repo of snapshot) {
    for (const wt of repo.entries) entries.push({ wt, repo: repo.repo });
    if (repo.error)
      errors.set(repoDisplayName(repo.repo), { repo: repo.repo, message: repo.error });
  }
  return { entries, errors };
}

export interface WorktreeRepoGroup {
  /** `repoDisplayName`: unique across hosts. */
  key: string;
  repo: WorktreeRepoRef;
  entries: WorktreeListEntry[];
  error?: string;
}

export interface WorktreeHostGroup {
  /** `hostIdOf`: `local` or the SSH target, as `host_disk_space` names it. */
  id: string;
  label: string;
  remote: boolean;
  repos: WorktreeRepoGroup[];
}

/** A measured host the list shows even when none of its worktrees are listed. */
export interface MeasuredHost {
  id: string;
  label: string;
}

/**
 * Rows by host, then repository: this machine first, then remote hosts by
 * name. Repositories whose scan failed keep their group (empty, with the
 * error); `measured` hosts without a listed repository get a host of their
 * own, so their disk space still shows.
 */
export function groupByHost(
  entries: WorktreeListEntry[],
  errors: ReadonlyMap<string, WorktreeRepoError>,
  measured: readonly MeasuredHost[] = [],
): WorktreeHostGroup[] {
  const hosts = new Map<string, WorktreeHostGroup>();
  const groupFor = (repo: WorktreeRepoRef): WorktreeRepoGroup => {
    const id = hostIdOf(repo);
    let host = hosts.get(id);
    if (!host) {
      host = { id, label: hostLabelOf(repo), remote: Boolean(repo.remote), repos: [] };
      hosts.set(id, host);
    }
    const key = repoDisplayName(repo);
    let group = host.repos.find((g) => g.key === key);
    if (!group) {
      group = { key, repo, entries: [] };
      host.repos.push(group);
    }
    return group;
  };
  for (const entry of entries) groupFor(entry.repo).entries.push(entry);
  for (const { repo, message } of errors.values()) groupFor(repo).error = message;

  for (const host of measured) {
    if (!hosts.has(host.id))
      hosts.set(host.id, { ...host, remote: host.id !== LOCAL_HOST_ID, repos: [] });
  }
  return [...hosts.values()].sort(
    (a, b) =>
      Number(a.remote) - Number(b.remote) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
}

/** The rows of `groupByHost` in the order they render: what J/K and ↑/↓ walk. */
export function rowsInOrder(hosts: readonly WorktreeHostGroup[]): WorktreeListEntry[] {
  return hosts.flatMap((host) => host.repos.flatMap((group) => group.entries));
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
