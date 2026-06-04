import { useCallback, useEffect, useRef } from 'react';
import { saveCachedEtags, saveCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { pollOpenPrsAggregate } from '@/services/github/polling';
import { getClosedPRs } from '@/services/github/pulls';
import { getClient, initClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { PollingManager } from '@/services/polling';
import { usePrStore } from '@/stores/pr-store';
import type { AppSettings, PullRequestWithChecks } from '@/types';

const log = createLogger('polling');

export function useGitHubPolling(settings: AppSettings, enabled: boolean = true) {
  const pollingRef = useRef<PollingManager<PullRequestWithChecks[]> | null>(null);
  // Keep settings in a ref so the poll function always reads the latest
  // without recreating the PollingManager on every settings change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Initialize client and start polling
  useEffect(() => {
    if (!enabled) {
      log.debug('polling deferred — not yet enabled');
      return;
    }
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
            'User-Agent': 'BorgDock',
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
      if (!c) {
        log.error('poll skipped — GitHub client not initialized');
        throw new Error('GitHub client not initialized');
      }
      c.markPollStart();

      const enabledRepos = settingsRef.current.repos.filter((r) => r.enabled);
      if (enabledRepos.length === 0) {
        log.debug('poll skipped — no enabled repos');
        return [];
      }

      // Snapshot prior state so a transient repo-level fetch failure keeps the
      // repo's last-known PRs in the list instead of dropping them for a cycle.
      // Otherwise they "reappear" on the next successful poll and fire spurious
      // new-PR / status-transition notifications.
      const priorByKey = new Map<string, PullRequestWithChecks>();
      for (const prior of usePrStore.getState().pullRequests) {
        const p = prior.pullRequest;
        priorByKey.set(`${p.repoOwner}/${p.repoName}#${p.number}`, prior);
      }

      const pollStart = performance.now();
      log.info('poll cycle start', { repoCount: enabledRepos.length });
      const allPrs: PullRequestWithChecks[] = [];

      for (let i = 0; i < enabledRepos.length; i++) {
        // Stagger: wait 500ms between repos (skip first)
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
        const repo = enabledRepos[i]!;
        const repoLabel = `${repo.owner}/${repo.name}`;
        try {
          const repoStart = performance.now();
          const prs = await pollOpenPrsAggregate(c, repo.owner, repo.name);
          for (const pr of prs) {
            allPrs.push(pr);
          }

          log.debug('poll: repo fetched', {
            repo: repoLabel,
            prs: prs.length,
            durationMs: Math.round(performance.now() - repoStart),
          });
        } catch (err) {
          log.error('poll: repo failed — keeping last-known PRs', err, { repo: repoLabel });
          for (const prior of priorByKey.values()) {
            const p = prior.pullRequest;
            if (p.repoOwner === repo.owner && p.repoName === repo.name) {
              allPrs.push(prior);
            }
          }
        }
      }

      log.info('poll cycle done', {
        totalPrs: allPrs.length,
        durationMs: Math.round(performance.now() - pollStart),
        rateLimitRemaining: c.getGraphqlRateLimit().remaining,
      });

      return allPrs;
    };

    const intervalMs = (settings.gitHub.pollIntervalSeconds || 60) * 1000;
    const manager = new PollingManager(pollFn, intervalMs);

    manager.rateLimitChecker = () => client.isRateLimitLow;

    manager.onResult = (results) => {
      usePrStore.getState().setPullRequests(results);
      usePrStore.getState().setPollingState(false, new Date());

      // REST and GraphQL are separate pools — surface whichever is tighter
      // (polling spends GraphQL points; cold paths still spend REST).
      const rest = client.getRateLimit();
      const graphql = client.getGraphqlRateLimit();
      const rl =
        rest.remaining >= 0 && (graphql.remaining < 0 || rest.remaining < graphql.remaining)
          ? rest
          : graphql;
      if (rl.remaining >= 0) {
        usePrStore.getState().setRateLimit({
          remaining: rl.remaining,
          limit: rl.total,
          resetAt: rl.reset ?? new Date(),
        });
      }

      // Persist PRs and ETags to SQLite cache (fire-and-forget)
      const enabledRepos = settingsRef.current.repos.filter((r) => r.enabled);
      for (const repo of enabledRepos) {
        const repoPrs = results.filter(
          (r) => r.pullRequest.repoOwner === repo.owner && r.pullRequest.repoName === repo.name,
        );
        if (repoPrs.length > 0) {
          saveCachedPRs(repo.owner, repo.name, repoPrs);
        }
      }
      saveCachedEtags(client.getEtagEntries());
    };

    manager.onError = (error) => {
      log.error('polling manager error', error);
      usePrStore.getState().setPollingState(false);
    };

    // Fetch closed PRs once
    (async () => {
      try {
        const closedResults: PullRequestWithChecks[] = [];
        for (const repo of settingsRef.current.repos.filter((r) => r.enabled)) {
          const closedPrs = await getClosedPRs(client, repo.owner, repo.name);
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
    log.info('polling manager started', { intervalMs });

    return () => {
      log.info('polling manager stopping');
      manager.stop();
      pollingRef.current = null;
    };
    // Only restart polling when auth, interval, or enabled changes.
    // Repo list changes are picked up via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settings.gitHub.personalAccessToken, settings.gitHub.pollIntervalSeconds]);

  const pollNow = useCallback(async () => {
    if (pollingRef.current) {
      usePrStore.getState().setPollingState(true);
      await pollingRef.current.pollNow();
    }
  }, []);

  return { pollNow };
}
