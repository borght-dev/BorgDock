import { useCallback, useEffect, useRef } from 'react';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { getCheckRunsForRef } from '@/services/github/checks';
import { getClosedPRs, getOpenPRs } from '@/services/github/pulls';
import { getClient, initClient } from '@/services/github/singleton';
import { PollingManager } from '@/services/polling';
import { usePrStore } from '@/stores/pr-store';
import type { AppSettings, PullRequestWithChecks } from '@/types';

export function useGitHubPolling(settings: AppSettings) {
  const pollingRef = useRef<PollingManager<PullRequestWithChecks[]> | null>(null);
  // Keep settings in a ref so the poll function always reads the latest
  // without recreating the PollingManager on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Initialize client and start polling
  useEffect(() => {
    const pat = settings.gitHub.personalAccessToken;
    const tokenGetter = () => getGitHubToken(pat);

    const client = initClient(tokenGetter);

    // Detect username
    (async () => {
      try {
        const token = await tokenGetter();
        const resp = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'PRDock',
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.login) {
            usePrStore.getState().setUsername(data.login);
          }
        }
      } catch {
        // Username detection is best-effort
      }
    })();

    // The poll function reads from the ref so it always uses current repos
    const pollFn = async (): Promise<PullRequestWithChecks[]> => {
      const c = getClient();
      if (!c) throw new Error('GitHub client not initialized');

      const enabledRepos = settingsRef.current.repos.filter((r) => r.enabled);
      if (enabledRepos.length === 0) return [];

      const allPrs: PullRequestWithChecks[] = [];

      for (let i = 0; i < enabledRepos.length; i++) {
        // Stagger: wait 500ms between repos (skip first)
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
        const repo = enabledRepos[i]!;
        try {
          const prs = await getOpenPRs(c, repo.owner, repo.name);

          for (const pr of prs) {
            try {
              const checks = await getCheckRunsForRef(c, repo.owner, repo.name, pr.headRef);
              allPrs.push(aggregatePrWithChecks(pr, checks));
            } catch {
              allPrs.push(aggregatePrWithChecks(pr, []));
            }
          }
        } catch (err) {
          console.error(`Failed to fetch PRs for ${repo.owner}/${repo.name}:`, err);
        }
      }

      return allPrs;
    };

    const intervalMs = (settings.gitHub.pollIntervalSeconds || 60) * 1000;
    const manager = new PollingManager(pollFn, intervalMs);

    manager.rateLimitChecker = () => client.isRateLimitLow;

    manager.onResult = (results) => {
      usePrStore.getState().setPullRequests(results);
      usePrStore.getState().setPollingState(false, new Date());

      const rl = client.getRateLimit();
      if (rl.remaining >= 0) {
        usePrStore.getState().setRateLimit({
          remaining: rl.remaining,
          limit: rl.total,
          resetAt: rl.reset ?? new Date(),
        });
      }
    };

    manager.onError = (error) => {
      console.error('Polling error:', error);
      usePrStore.getState().setPollingState(false);
    };

    // Fetch closed PRs once
    (async () => {
      try {
        const closedResults: PullRequestWithChecks[] = [];
        for (const repo of settingsRef.current.repos.filter((r) => r.enabled)) {
          const closedPrs = await getClosedPRs(
            client,
            repo.owner,
            repo.name,
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          );
          for (const pr of closedPrs) {
            closedResults.push(aggregatePrWithChecks(pr, []));
          }
        }
        usePrStore.getState().setClosedPullRequests(closedResults);
      } catch {
        // Closed PR fetching is best-effort
      }
    })();

    usePrStore.getState().setPollingState(true);
    pollingRef.current = manager;
    manager.start();

    return () => {
      manager.stop();
      pollingRef.current = null;
    };
    // Only restart polling when auth or interval changes.
    // Repo list changes are picked up via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gitHub.personalAccessToken, settings.gitHub.pollIntervalSeconds]);

  const pollNow = useCallback(async () => {
    if (pollingRef.current) {
      usePrStore.getState().setPollingState(true);
      await pollingRef.current.pollNow();
    }
  }, []);

  return { pollNow };
}
