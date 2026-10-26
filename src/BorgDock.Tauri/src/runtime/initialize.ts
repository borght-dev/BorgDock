import { emitTo } from '@tauri-apps/api/event';
import { commands } from '@/generated/commands';
import { loadCachedEtags, loadCachedPRs } from '@/services/cache';
import { getGitHubToken } from '@/services/github/auth';
import { bindRepoClient, getClient, initClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { commandData } from '@/services/native-command';
import { useInitStore } from '@/stores/initStore';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, PullRequestWithChecks } from '@/types';
import type { createGitHubSync } from './github-sync';

const log = createLogger('init');

export async function initialize(
  settings: AppSettings,
  sync: ReturnType<typeof createGitHubSync>,
  cancelled: () => boolean,
): Promise<boolean> {
  const init = useInitStore.getState();
  let step: 'auth' | 'discover-repos' | 'fetch-prs' | 'fetch-checks' = 'auth';
  const start = performance.now();
  try {
    init.startStep(step);
    const pat = settings.gitHub.personalAccessToken;
    const client = initClient(() => getGitHubToken(pat));
    for (const repo of settings.repos) {
      const account = repo.githubAccount?.trim() || undefined;
      if (account && !getClient(account)) initClient(() => getGitHubToken(pat, account), account);
      bindRepoClient(repo.owner, repo.name, account);
    }
    const username = settings.gitHub.username?.trim();
    if (username) usePrStore.getState().setUsername(username);
    await getGitHubToken(pat);
    if (cancelled()) return false;
    init.completeStep(step);
    void client
      .get<{ login: string }>('user')
      .then(({ login }) => {
        if (cancelled() || !login) return;
        usePrStore.getState().setUsername(login);
        const store = useSettingsStore.getState();
        if (store.settings.gitHub.username !== login) {
          store.updateSettings({ gitHub: { ...store.settings.gitHub, username: login } });
        }
      })
      .catch(() => {});

    step = 'discover-repos';
    init.startStep(step);
    const repos = settings.repos.filter((repo) => repo.enabled);
    init.completeStep(step, { count: repos.length });
    step = 'fetch-prs';
    init.startStep(step);
    const enabled = new Set(repos.map((repo) => `${repo.owner}/${repo.name}`));
    usePrStore
      .getState()
      .setPullRequests(
        usePrStore
          .getState()
          .pullRequests.filter(({ pullRequest: pr }) =>
            enabled.has(`${pr.repoOwner}/${pr.repoName}`),
          ),
      );
    try {
      await commandData(commands.cacheInit());
      if (cancelled()) return false;
      const cached = (
        await Promise.all(repos.map((repo) => loadCachedPRs(repo.owner, repo.name)))
      ).flat() as PullRequestWithChecks[];
      if (cancelled()) return false;
      if (cached.length > 0) {
        usePrStore.getState().setPullRequests(cached);
        usePrStore.getState().setPollingState(false);
      }
      void loadCachedEtags()
        .then((entries) => {
          if (cancelled()) return false;
          for (const account of new Set([undefined, ...repos.map((repo) => repo.githubAccount)])) {
            getClient(account)?.seedEtagCache(
              entries.map((entry) => ({ url: entry.url, etag: entry.etag, data: entry.jsonData })),
            );
          }
        })
        .catch(() => {});
    } catch (error) {
      log.warn('cache unavailable; fetching live data', { error: String(error) });
    }
    if (cancelled()) return false;
    const cached = usePrStore.getState().pullRequests.length > 0;
    sync.start(true);
    if (!cached) await sync.refresh();
    if (cancelled()) return false;
    init.completeStep(step, { count: usePrStore.getState().pullRequests.length });
    step = 'fetch-checks';
    init.startStep(step);
    init.completeStep(step);
    init.markComplete();
    log.info('init sequence complete', {
      durationMs: Math.round(performance.now() - start),
      cached,
    });
    void emitTo('flyout', 'init-complete', {}).catch(() => {});
    if (cached)
      void sync
        .refresh()
        .catch((error) => log.warn('background refresh failed', { error: String(error) }));
    return true;
  } catch (error) {
    if (!cancelled()) init.failStep(step, error instanceof Error ? error.message : String(error));
    return false;
  }
}
