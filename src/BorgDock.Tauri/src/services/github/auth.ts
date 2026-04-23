import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';

const log = createLogger('auth');

// gh CLI tokens are long-lived (hours to days). Re-running `gh auth token`
// on every API request spawns a subprocess per call — on Windows that's
// 200–1000 ms each, and Tauri's sync-command dispatcher serializes them, so
// concurrent fetches end up queued behind subprocess spawns. Cache aggressively
// and invalidate only when we actually see an auth error.
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
interface CachedToken {
  value: string;
  expiresAt: number;
  source: 'gh-cli' | 'pat';
}

let cached: CachedToken | null = null;
// Deduplicate concurrent fetches: if two callers ask for a token at the same
// time and the cache is empty, they should share ONE underlying invoke() call.
let inflight: Promise<string> | null = null;

/**
 * Gets a GitHub token. Tries the `gh` CLI first via Tauri command,
 * falls back to PAT from settings. Result is cached for ~5 minutes so
 * hot request paths don't re-spawn subprocesses per call.
 */
export async function getGitHubToken(patFromSettings?: string): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const start = performance.now();
    log.debug('getGitHubToken: cache miss — refreshing');

    // Try gh CLI token first
    try {
      log.debug('invoke gh_cli_token start');
      const token = await invoke<string>('gh_cli_token');
      log.debug('invoke gh_cli_token done', {
        durationMs: Math.round(performance.now() - start),
        length: token?.length ?? 0,
      });
      if (token && token.trim().length > 0) {
        cached = {
          value: token.trim(),
          expiresAt: now + TOKEN_CACHE_TTL_MS,
          source: 'gh-cli',
        };
        return cached.value;
      }
      log.warn('gh_cli_token returned empty — falling back to PAT');
    } catch (err) {
      log.debug('gh_cli_token failed — falling back to PAT', {
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - start),
      });
    }

    // Fall back to PAT from settings
    if (patFromSettings && patFromSettings.trim().length > 0) {
      cached = {
        value: patFromSettings.trim(),
        expiresAt: now + TOKEN_CACHE_TTL_MS,
        source: 'pat',
      };
      return cached.value;
    }

    log.error('getGitHubToken: no token available');
    throw new Error(
      'No GitHub token available. Configure a Personal Access Token or install the GitHub CLI.',
    );
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Clear the cached token. Call this when an API request returns 401/403 so
 * the next request re-runs `gh auth token` / re-reads the PAT.
 */
export function invalidateGitHubTokenCache(): void {
  if (cached) {
    log.info('token cache invalidated', { source: cached.source });
  }
  cached = null;
  inflight = null;
}
