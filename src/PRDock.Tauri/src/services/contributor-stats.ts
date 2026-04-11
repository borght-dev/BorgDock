import type { GitHubClient } from '@/services/github/client';

interface ContributorStat {
  author: { login: string };
  total: number;
}

let cache: Map<string, number> = new Map();
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let _cacheFingerprint = '';

export async function fetchContributorWeights(
  client: GitHubClient,
  repos: { owner: string; name: string }[],
  username: string,
): Promise<Map<string, number>> {
  const fingerprint = repos.map(r => `${r.owner}/${r.name}`).sort().join(',') + ':' + username;
  if (fingerprint !== _cacheFingerprint) {
    cache = new Map();
    _cacheFingerprint = fingerprint;
  }

  const weights = new Map<string, number>();
  const uLower = username.toLowerCase();

  for (const repo of repos) {
    const key = `${repo.owner}/${repo.name}`;
    try {
      const stats = await fetchWithRetry(client, `repos/${repo.owner}/${repo.name}/stats/contributors`);
      if (!Array.isArray(stats)) {
        weights.set(key, 1.0);
        continue;
      }

      // Find max commits and user's commits
      let maxCommits = 0;
      let userCommits = 0;
      for (const stat of stats as ContributorStat[]) {
        if (stat.total > maxCommits) maxCommits = stat.total;
        if (stat.author?.login?.toLowerCase() === uLower) {
          userCommits = stat.total;
        }
      }

      // Normalize to 0-1
      const weight = maxCommits > 0 ? userCommits / maxCommits : 1.0;
      weights.set(key, weight);
    } catch {
      // Fall back to 1.0 — no degradation
      weights.set(key, 1.0);
    }
  }

  cache = weights;
  return weights;
}

async function fetchWithRetry(client: GitHubClient, path: string, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await client.get<unknown>(path);
    // GitHub returns 202 while computing stats — we get an empty/partial result
    // The client throws on non-2xx so if we get here, check if it's still computing
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      // Stats not ready yet, wait and retry
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    return result;
  }
  return [];
}

export function getCachedWeights(): Map<string, number> {
  return cache;
}

export function startDailyRefresh(
  client: GitHubClient,
  repos: { owner: string; name: string }[],
  username: string,
): void {
  stopDailyRefresh();
  // Refresh every 24 hours
  refreshTimer = setInterval(
    () => {
      fetchContributorWeights(client, repos, username).catch((err) => console.warn('Contributor weight refresh failed:', err));
    },
    24 * 60 * 60 * 1000,
  );
}

export function stopDailyRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
