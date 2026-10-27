import {
  type FreshRepository,
  gitHubRepositoryFailed,
  ingestGitHubPoll,
} from '@/services/activity/adapters/github';
import { saveCachedEtags, saveCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { getCheckSummaryForRef } from '@/services/github/checks';
import { pollOpenPrsAggregate } from '@/services/github/polling';
import { getClosedPRs, getOpenPRs } from '@/services/github/pulls';
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

import { trackPolling } from './visibility';

export function createGitHubSync(getSettings: () => AppSettings) {
  let manager: PollingManager<PullRequestWithChecks[]> | null = null;
  let stopped = true;
  let untrack: (() => void) | undefined;
  return {
    start(deferred = false) {
      if (!stopped) return;
      stopped = false;
      const settings = getSettings();
      const accountSignature = settings.repos
        .map((r) => `${r.owner}/${r.name}:${r.githubAccount ?? ''}`)
        .sort()
        .join('|');
      log.debug('configuring repository account bindings', { accountSignature });
      const pat = settings.gitHub.personalAccessToken;
      const tokenGetter = () => getGitHubToken(pat);
      const defaultClient = getClient() ?? initClient(tokenGetter);
      const clientsByAccount = new Map<string, ReturnType<typeof initClient>>([
        ['', defaultClient],
      ]);
      const ensureRepoClient = (repo: (typeof settings.repos)[number]) => {
        const account = repo.githubAccount?.trim() || undefined;
        const accountKey = account?.toLowerCase() ?? '';
        let repoClient = clientsByAccount.get(accountKey);
        if (!repoClient) {
          repoClient =
            getClient(account) ?? initClient(() => getGitHubToken(pat, account), account);
          clientsByAccount.set(accountKey, repoClient);
        }
        bindRepoClient(repo.owner, repo.name, account);
        return repoClient;
      };
      for (const repo of getSettings().repos) ensureRepoClient(repo);

      /** The repositories the last poll read, as `owner/name` in lower case. */
      let polledRepos: string[] = [];
      /** The same, with how each was read, for the activity journal. */
      let freshRead: { repositories: FreshRepository[]; startedAt: number } = {
        repositories: [],
        startedAt: 0,
      };

      // The poll function reads from the ref so it always uses current repos
      const pollFn = async (): Promise<PullRequestWithChecks[]> => {
        if (!getClient()) {
          log.error('poll skipped — GitHub client not initialized');
          throw new Error('GitHub client not initialized');
        }
        const enabledRepos = getSettings().repos.filter((r) => r.enabled);
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
        const startedAt = Date.now();
        let successfulRepos = 0;
        const freshRepos: string[] = [];
        const freshRepositories: FreshRepository[] = [];
        const fresh = (repo: (typeof enabledRepos)[number], path: FreshRepository['path']) => {
          freshRepos.push(`${repo.owner}/${repo.name}`.toLowerCase());
          freshRepositories.push({
            owner: repo.owner,
            name: repo.name,
            account: repo.githubAccount?.trim() ?? '',
            path,
          });
        };
        log.info('poll cycle start', { repoCount: enabledRepos.length });
        const perRepo = await Promise.all(
          enabledRepos.map(async (repo) => {
            const repoLabel = `${repo.owner}/${repo.name}`;
            const repoClient = ensureRepoClient(repo);
            repoClient.markPollStart();
            try {
              const repoStart = performance.now();
              const prs = await pollOpenPrsAggregate(repoClient, repo.owner, repo.name);
              successfulRepos++;
              fresh(repo, 'graphql');

              log.debug('poll: repo fetched', {
                repo: repoLabel,
                prs: prs.length,
                durationMs: Math.round(performance.now() - repoStart),
              });
              return prs;
            } catch (err) {
              log.warn('GraphQL poll failed; trying REST open list', {
                repo: repoLabel,
                error: String(err),
              });
              try {
                const open = await getOpenPRs(repoClient, repo.owner, repo.name, {
                  hydrateDetails: false,
                });
                const reconciled: PullRequestWithChecks[] = [];
                for (let offset = 0; offset < open.length; offset += 4) {
                  const batch = await Promise.all(
                    open.slice(offset, offset + 4).map(async (pr) => {
                      const previous = priorByKey.get(
                        `${pr.repoOwner}/${pr.repoName}#${pr.number}`,
                      );
                      const sameHead = !!pr.headSha && previous?.pullRequest.headSha === pr.headSha;
                      const prior = sameHead ? previous.pullRequest : undefined;
                      const refreshed = prior
                        ? {
                            ...pr,
                            reviewStatus: prior.reviewStatus,
                            latestReviews: prior.latestReviews,
                            mergeable: pr.mergeable ?? prior.mergeable,
                            additions: pr.additions ?? prior.additions,
                            deletions: pr.deletions ?? prior.deletions,
                            changedFiles: pr.changedFiles ?? prior.changedFiles,
                            commitCount: pr.commitCount ?? prior.commitCount,
                          }
                        : pr;
                      try {
                        const checks = await getCheckSummaryForRef(
                          repoClient,
                          repo.owner,
                          repo.name,
                          pr.headSha ?? pr.headRef,
                        );
                        return aggregatePrWithChecks(refreshed, checks);
                      } catch (checkError) {
                        log.warn('REST check fetch failed', {
                          repo: repoLabel,
                          number: pr.number,
                          error: String(checkError),
                        });
                        return sameHead
                          ? {
                              ...previous,
                              pullRequest: refreshed,
                              overallStatus: 'gray' as const,
                              checksUnavailable: true,
                            }
                          : aggregatePrWithChecks(refreshed, undefined);
                      }
                    }),
                  );
                  reconciled.push(...batch);
                }
                log.info('poll: repo reconciled via REST', {
                  repo: repoLabel,
                  prs: reconciled.length,
                });
                successfulRepos++;
                fresh(repo, 'rest');
                return reconciled;
              } catch (restError) {
                log.error('poll: both APIs failed — keeping last-known PRs', restError, {
                  repo: repoLabel,
                });
                void gitHubRepositoryFailed(repo.owner, repo.name, repoClient);
                return [...priorByKey.values()].filter((prior) => {
                  const p = prior.pullRequest;
                  return p.repoOwner === repo.owner && p.repoName === repo.name;
                });
              }
            }
          }),
        );
        if (successfulRepos === 0) throw new Error('Unable to refresh any GitHub repository');
        polledRepos = freshRepos;
        freshRead = { repositories: freshRepositories, startedAt };
        const allPrs = perRepo.flat();

        log.info('poll cycle done', {
          totalPrs: allPrs.length,
          durationMs: Math.round(performance.now() - pollStart),
          accounts: [...new Set(enabledRepos.map((repo) => repo.githubAccount || 'active'))],
        });

        return allPrs;
      };

      const intervalMs = (settings.gitHub.pollIntervalSeconds || 60) * 1000;
      manager = new PollingManager(pollFn, intervalMs);

      manager.rateLimitChecker = () =>
        getSettings()
          .repos.filter((repo) => repo.enabled)
          .some((repo) => getClientForRepo(repo.owner, repo.name)?.isRateLimitLow);

      manager.onResult = (results) => {
        if (stopped) return;
        usePrStore.getState().setPullRequests(results);
        usePrStore.getState().markReposPolled(polledRepos, Date.now());
        usePrStore.getState().setPollingState(false, new Date());
        void ingestGitHubPoll({
          ...freshRead,
          results,
          clientFor: (owner, name) => getClientForRepo(owner, name) ?? null,
        });

        // REST and GraphQL are separate pools — surface whichever is tighter
        // (polling spends GraphQL points; cold paths still spend REST).
        const limits = getSettings()
          .repos.filter((repo) => repo.enabled)
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
        const enabledRepos = getSettings().repos.filter((r) => r.enabled);
        for (const repo of enabledRepos) {
          const repoPrs = results.filter(
            (r) => r.pullRequest.repoOwner === repo.owner && r.pullRequest.repoName === repo.name,
          );
          saveCachedPRs(repo.owner, repo.name, repoPrs);
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
              getSettings()
                .repos.filter((r) => r.enabled)
                .map(async (repo) => {
                  const repoClient = ensureRepoClient(repo);
                  const closedPrs = await getClosedPRs(repoClient, repo.owner, repo.name);
                  return closedPrs.map((pr) => aggregatePrWithChecks(pr, []));
                }),
            )
          ).flat();
          if (!stopped) usePrStore.getState().setClosedPullRequests(closedResults);
        } catch {
          // Closed PR fetching is best-effort
        }
      })();

      usePrStore.getState().setPollingState(true);
      untrack = trackPolling(manager);
      if (deferred) manager.startDeferred();
      else manager.start();
      log.info('polling manager started', { intervalMs });
    },
    stop() {
      stopped = true;
      manager?.stop();
      manager = null;
      untrack?.();
    },
    async refresh() {
      const current = manager;
      if (!current) return;
      usePrStore.getState().setPollingState(true);
      await current.pollNow();
      if (current.error) throw current.error;
    },
  };
}
