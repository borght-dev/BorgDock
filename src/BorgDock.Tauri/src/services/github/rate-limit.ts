import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { getGitHubToken } from './auth';

export interface RateLimit {
  used: number;
  limit: number;
  resetAt: number; // epoch seconds (matches GitHub's response)
}

/** REST (core) and GraphQL draw from separate 5000/h pools on GitHub's side. */
export interface DualRateLimit {
  rest: RateLimit;
  graphql: RateLimit;
}

/**
 * Hits GET /rate_limit on the GitHub REST API and returns both the `core`
 * (REST) and `graphql` resource usage. Token must be supplied (caller
 * resolves via getGitHubToken).
 */
export async function fetchGitHubRateLimit(token: string): Promise<DualRateLimit> {
  const resp = await fetch('https://api.github.com/rate_limit', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'BorgDock',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub rate_limit returned ${resp.status}`);
  }
  const body = await resp.json();
  const core = body?.resources?.core ?? {};
  const graphql = body?.resources?.graphql ?? {};
  return {
    rest: {
      used: Number(core.used ?? 0),
      limit: Number(core.limit ?? 5000),
      resetAt: Number(core.reset ?? 0),
    },
    graphql: {
      used: Number(graphql.used ?? 0),
      limit: Number(graphql.limit ?? 5000),
      resetAt: Number(graphql.reset ?? 0),
    },
  };
}

/**
 * React hook that polls /rate_limit on `pollMs` interval (default 60 s).
 * Returns null until the first fetch lands. Resolves the token via
 * `getGitHubToken(pat)`, where pat comes from settings if set.
 */
export function useGitHubRateLimit(pollMs = 60_000): DualRateLimit | null {
  const pat = useSettingsStore((s) => s.settings.gitHub.personalAccessToken);
  const [rl, setRl] = useState<DualRateLimit | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const token = await getGitHubToken(pat);
        const next = await fetchGitHubRateLimit(token);
        if (!cancelled) setRl(next);
      } catch {
        // Swallow — rate limit is a UI-only nicety; GitHub auth errors are
        // surfaced via the connection-status path elsewhere.
      }
    }
    fetchOnce();
    const t = setInterval(fetchOnce, pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pat, pollMs]);

  return rl;
}
