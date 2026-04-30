import type { RepoSettings } from '@/types/settings';

/**
 * Find a saved repo config by `(owner, name)`, case-insensitive.
 *
 * GitHub returns the canonical case in API payloads, but the user may have
 * typed a different case in settings. Six call sites used to inline
 * `repos.find(r => r.owner === owner && r.name === name)`, so a slightly
 * different capitalization silently broke checkout / Claude / settings
 * lookup with no error message.
 */
export function findRepoConfig(
  repos: readonly RepoSettings[],
  owner: string,
  name: string,
): RepoSettings | undefined {
  const o = owner.toLowerCase();
  const n = name.toLowerCase();
  return repos.find((r) => r.owner.toLowerCase() === o && r.name.toLowerCase() === n);
}
