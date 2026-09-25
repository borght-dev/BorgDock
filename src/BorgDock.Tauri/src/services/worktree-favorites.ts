import type { AppSettings } from '@/types/settings';
import type { WorktreeCacheRepo } from '@/types/worktree';

/**
 * Worktree favourites live on the repository they belong to in settings:
 * `repos[].favoriteWorktreePaths` for local repos and
 * `remoteWorktreeRepos[].favoriteWorktreePaths` for worktrees fetched over
 * SSH. In memory they are one set of keys, `path` for a local worktree and
 * `remote:<id>:<path>` for a remote one (see `worktreeKey`).
 */

type RepoRef = WorktreeCacheRepo['repo'];

/** The id the worktree cache gives a configured remote repo. */
export function configuredRemoteId(repo: {
  id: string;
  sshTarget: string;
  basePath: string;
}): string {
  return repo.id.trim() || `${repo.sshTarget}:${repo.basePath}`;
}

/** Every favourite in `settings` as list keys. */
export function favoriteKeysFromSettings(settings: Partial<AppSettings>): Set<string> {
  const keys = new Set<string>();
  for (const r of settings.repos ?? []) {
    for (const p of r.favoriteWorktreePaths ?? []) keys.add(p);
  }
  for (const r of settings.remoteWorktreeRepos ?? []) {
    const remoteId = configuredRemoteId(r);
    for (const p of r.favoriteWorktreePaths ?? []) keys.add(`remote:${remoteId}:${p}`);
  }
  return keys;
}

function favoritePathsAfterToggle(
  existing: string[],
  path: string,
  wasFavorite: boolean,
): string[] {
  if (wasFavorite) return existing.filter((favoritePath) => favoritePath !== path);
  return existing.includes(path) ? existing : [...existing, path];
}

/**
 * `settings` with `path` added to (or, when `wasFavorite`, removed from) the
 * favourites of the repository `repo` names. Other repositories are untouched.
 */
export function settingsWithFavoriteToggled<T extends Partial<AppSettings>>(
  settings: T,
  repo: RepoRef,
  path: string,
  wasFavorite: boolean,
): T {
  if (repo.remote) {
    const remoteWorktreeRepos = (settings.remoteWorktreeRepos ?? []).map((r) => {
      if (configuredRemoteId(r) !== repo.remote?.id) return r;
      const existing = r.favoriteWorktreePaths ?? [];
      return {
        ...r,
        favoriteWorktreePaths: favoritePathsAfterToggle(existing, path, wasFavorite),
      };
    });
    return { ...settings, remoteWorktreeRepos };
  }
  const repos = (settings.repos ?? []).map((r) => {
    if (r.owner !== repo.owner || r.name !== repo.name) return r;
    const existing = r.favoriteWorktreePaths ?? [];
    return { ...r, favoriteWorktreePaths: favoritePathsAfterToggle(existing, path, wasFavorite) };
  });
  return { ...settings, repos };
}
