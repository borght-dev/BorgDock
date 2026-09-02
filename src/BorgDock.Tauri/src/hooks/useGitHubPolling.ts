import { useCallback, useEffect, useRef } from 'react';
import { saveCachedEtags, saveCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { pollOpenPrsAggregate } from '@/services/github/polling';
import { getClosedPRs } from '@/services/github/pulls';
import {
  bindRepoClient,
  getClient,
  getClientForRepo,
  initClient,
} from '@/services/github/singleton';
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
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const accountSignature = settings.repos
    .map((repo) => `${repo.owner}/${repo.name}:${repo.githubAccount ?? ''}`)
    .sort()
    .join('|');

  // Initialize client and start polling
  useEffect(() => {
    if (!enabled) {
      log.debug('polling deferred — not yet enabled');
      return;
    }
    log.debug('configuring repository account bindings', { accountSignature });
    const pat = settings.gitHub.personalAccessToken;
    const tokenGetter = () => getGitHubToken(pat);
    const defaultClient = initClient(tokenGetter);
    const clientsByAccount = new Map<string, ReturnType<typeof initClient>>([['', defaultClient]]);
    const ensureRepoClient = (repo: (typeof settings.repos)[number]) => {
      const account = repo.githubAccount?.trim() || undefined;
      const accountKey = account?.toLowerCase() ?? '';
      let repoClient = clientsByAccount.get(accountKey);
      if (!repoClient) {
        repoClient = initClient(() => getGitHubToken(pat, account), account);
        clientsByAccount.set(accountKey, repoClient);
      }
      bindRepoClient(repo.owner, repo.name, account);
      return repoClient;
    };
    for (const repo of settingsRef.current.repos) ensureRepoClient(repo);

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
      if (!getClient()) {
        log.error('poll skipped — GitHub client not initialized');
        throw new Error('GitHub client not initialized');
      }
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
      const perRepo = await Promise.all(
        enabledRepos.map(async (repo) => {
          const repoLabel = `${repo.owner}/${repo.name}`;
          const repoClient = ensureRepoClient(repo);
          repoClient.markPollStart();
          try {
            const repoStart = performance.now();
            const prs = await pollOpenPrsAggregate(repoClient, repo.owner, repo.name);

            log.debug('poll: repo fetched', {
              repo: repoLabel,
              prs: prs.length,
              durationMs: Math.round(performance.now() - repoStart),
            });
            return prs;
          } catch (err) {
            log.error('poll: repo failed — keeping last-known PRs', err, { repo: repoLabel });
            return [...priorByKey.values()].filter((prior) => {
              const p = prior.pullRequest;
              return p.repoOwner === repo.owner && p.repoName === repo.name;
            });
          }
        }),
      );
      const allPrs = perRepo.flat();

      log.info('poll cycle done', {
        totalPrs: allPrs.length,
        durationMs: Math.round(performance.now() - pollStart),
        accounts: [...new Set(enabledRepos.map((repo) => repo.githubAccount || 'active'))],
      });

      return allPrs;
    };

    const intervalMs = (settings.gitHub.pollIntervalSeconds || 60) * 1000;
    const manager = new PollingManager(pollFn, intervalMs);

    manager.rateLimitChecker = () =>
      settingsRef.current.repos
        .filter((repo) => repo.enabled)
        .some((repo) => getClientForRepo(repo.owner, repo.name)?.isRateLimitLow);

    manager.onResult = (results) => {
      usePrStore.getState().setPullRequests(results);
      usePrStore.getState().setPollingState(false, new Date());

      // REST and GraphQL are separate pools — surface whichever is tighter
      // (polling spends GraphQL points; cold paths still spend REST).
      const limits = settingsRef.current.repos
        .filter((repo) => repo.enabled)
        .flatMap((repo) => {
          const repoClient = getClientForRepo(repo.owner, repo.name);
          if (!repoClient) return [];
          return [
            { ...repoClient.getRateLimit(), pool: 'rest' as const, login: repoClient.account },
            {
              ...repoClient.getGraphqlRateLimit(),
              pool: 'graphql' as const,
              login: repoClient.account,
            },
          ];
        })
        .filter((limit) => limit.remaining >= 0)
        .sort((a, b) => a.remaining - b.remaining);
      const rl = limits[0];
      if (rl) {
        usePrStore.getState().setRateLimit({
          remaining: rl.remaining,
          limit: rl.total,
          resetAt: rl.reset ?? new Date(),
          pool: rl.pool,
          login: rl.login || 'active',
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
      const accountClients = new Set(
        enabledRepos.map((repo) => getClientForRepo(repo.owner, repo.name)).filter(Boolean),
      );
      saveCachedEtags(
        [...accountClients].flatMap((accountClient) => accountClient?.getEtagEntries() ?? []),
      );
    };

    manager.onError = (error) => {
      log.error('polling manager error', error);
      usePrStore.getState().setPollingState(false);
    };

    // Fetch closed PRs once
    (async () => {
      try {
        const closedResults = (
          await Promise.all(
            settingsRef.current.repos
              .filter((r) => r.enabled)
              .map(async (repo) => {
                const repoClient = ensureRepoClient(repo);
                const closedPrs = await getClosedPRs(repoClient, repo.owner, repo.name);
                return closedPrs.map((pr) => aggregatePrWithChecks(pr, []));
              }),
          )
        ).flat();
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
  }, [
    enabled,
    settings.gitHub.personalAccessToken,
    settings.gitHub.pollIntervalSeconds,
    accountSignature,
  ]);

  const pollNow = useCallback(async () => {
    if (pollingRef.current) {
      usePrStore.getState().setPollingState(true);
      await pollingRef.current.pollNow();
    }
  }, []);

  return { pollNow };
}
