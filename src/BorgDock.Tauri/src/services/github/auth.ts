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

const cached = new Map<string, CachedToken>();
// Deduplicate concurrent fetches: if two callers ask for a token at the same
// time and the cache is empty, they should share ONE underlying invoke() call.
const inflight = new Map<string, Promise<string>>();

/**
 * Gets a GitHub token. Tries the `gh` CLI first via Tauri command,
 * falls back to PAT from settings. Result is cached for ~5 minutes so
 * hot request paths don't re-spawn subprocesses per call.
 */
export async function getGitHubToken(patFromSettings?: string, account?: string): Promise<string> {
  const accountKey = account?.trim().toLowerCase() || 'active';
  const now = Date.now();
  const cachedToken = cached.get(accountKey);
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const pending = inflight.get(accountKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const start = performance.now();
    log.debug('getGitHubToken: cache miss — refreshing');

    // Try gh CLI token first
    try {
      log.debug('invoke gh_cli_token start');
      const token = account
        ? await invoke<string>('gh_cli_token', { user: account })
        : await invoke<string>('gh_cli_token');
      log.debug('invoke gh_cli_token done', {
        durationMs: Math.round(performance.now() - start),
        length: token?.length ?? 0,
      });
      if (token && token.trim().length > 0) {
        const entry: CachedToken = {
          value: token.trim(),
          expiresAt: now + TOKEN_CACHE_TTL_MS,
          source: 'gh-cli',
        };
        cached.set(accountKey, entry);
        return entry.value;
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
      const entry: CachedToken = {
        value: patFromSettings.trim(),
        expiresAt: now + TOKEN_CACHE_TTL_MS,
        source: 'pat',
      };
      cached.set(accountKey, entry);
      return entry.value;
    }

    log.error('getGitHubToken: no token available');
    throw new Error(
      'No GitHub token available. Configure a Personal Access Token or install the GitHub CLI.',
    );
  })();
  inflight.set(accountKey, request);

  try {
    return await request;
  } finally {
    inflight.delete(accountKey);
  }
}

/**
 * Clear the cached token. Call this when an API request returns 401/403 so
 * the next request re-runs `gh auth token` / re-reads the PAT.
 */
export function invalidateGitHubTokenCache(account?: string): void {
  if (account) {
    const key = account.trim().toLowerCase();
    cached.delete(key);
    inflight.delete(key);
    log.info('token cache invalidated', { account });
    return;
  }
  cached.clear();
  inflight.clear();
  log.info('token caches invalidated');
}
