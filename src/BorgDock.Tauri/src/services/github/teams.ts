import { createLogger } from '@/services/logger';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';
import type { GitHubClient } from './client';

const log = createLogger('github:teams');

const STORE_FILE = 'ui-state.json';
const STORE_KEY = 'githubTeams';

interface GitHubTeamDto {
  slug: string;
  name?: string;
  organization?: { login: string } | null;
}

/**
 * The viewer's team memberships as `org/slug` strings. Needs the `read:org`
 * scope — without it GitHub answers 403/404 and we return `[]`, which the
 * caller treats as "unknown", not as "no teams".
 */
export async function fetchViewerTeams(client: GitHubClient): Promise<string[]> {
  const teams = await client.get<GitHubTeamDto[]>('user/teams?per_page=100');
  return teams
    .filter((t) => typeof t.slug === 'string' && t.slug.length > 0)
    .map((t) => (t.organization?.login ? `${t.organization.login}/${t.slug}` : t.slug));
}

let syncStarted = false;

/**
 * Best-effort, non-blocking team detection. Applies the cached list first
 * (instant on cold start), then refreshes from the API once per app session
 * and re-caches. Never throws; every failure is a debug log.
 */
export function syncViewerTeams(client: GitHubClient, apply: (teams: string[]) => void): void {
  if (syncStarted) return;
  syncStarted = true;

  void (async () => {
    try {
      const cached = await readFromTauriStore<string[]>(STORE_FILE, STORE_KEY);
      if (Array.isArray(cached) && cached.length > 0) apply(cached);
    } catch (err) {
      log.debug('cached teams unavailable', { error: String(err) });
    }

    try {
      const teams = await fetchViewerTeams(client);
      if (teams.length === 0) return;
      apply(teams);
      await persistToTauriStore(STORE_FILE, STORE_KEY, teams).catch((err) =>
        log.debug('persisting teams failed', { error: String(err) }),
      );
    } catch (err) {
      // Typically a token without read:org — the manual settings list still works.
      log.debug('team detection skipped', { error: String(err) });
    }
  })();
}

/** Test hook — lets the once-per-session guard be reset. */
export function _resetTeamSyncForTests(): void {
  syncStarted = false;
}
