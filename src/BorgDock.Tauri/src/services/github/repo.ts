import type { GitHubClient } from './client';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface RepoMergeConfig {
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
}

interface RepoApiResponse {
  allow_merge_commit?: boolean;
  allow_squash_merge?: boolean;
  allow_rebase_merge?: boolean;
}

const cache = new Map<string, Promise<RepoMergeConfig>>();

/**
 * Fetch a repo's allowed merge methods. Cached per `owner/repo` for the
 * lifetime of the module — these settings rarely change and we don't want to
 * burn an API call on every merge button click. A failed fetch is not cached
 * so a transient network error doesn't poison the result.
 */
export async function getRepoMergeConfig(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<RepoMergeConfig> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = (async () => {
    const data = await client.get<RepoApiResponse>(`repos/${owner}/${repo}`);
    return {
      allowMergeCommit: data.allow_merge_commit !== false,
      allowSquashMerge: data.allow_squash_merge !== false,
      allowRebaseMerge: data.allow_rebase_merge !== false,
    };
  })();

  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * Pick a merge method permitted by the repo. Preference order matches the
 * codebase's existing convention (MergeToast and OverviewTab both default to
 * squash): squash > merge > rebase. If the repo lookup failed and we have no
 * config at all, falls back to squash — the most common modern default.
 */
export function pickMergeMethod(config: RepoMergeConfig | null): MergeMethod {
  if (!config) return 'squash';
  if (config.allowSquashMerge) return 'squash';
  if (config.allowMergeCommit) return 'merge';
  if (config.allowRebaseMerge) return 'rebase';
  return 'squash';
}

/** Test-only — drop the cache so each test starts with a clean slate. */
export function __resetRepoMergeConfigCacheForTests(): void {
  cache.clear();
}
