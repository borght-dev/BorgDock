import { emitTo } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { loadCachedEtags, loadCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import type { GitHubClient } from '@/services/github/client';
import { getOpenPRs } from '@/services/github/pulls';
import { bindRepoClient, initClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { useInitStore } from '@/stores/initStore';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, PullRequest, PullRequestWithChecks } from '@/types';

const log = createLogger('init');
const FETCH_PRS_TIMEOUT_MS = 20_000;

/**
 * Seed the client's ETag cache from SQLite. Off the critical path: the first
 * API calls simply miss the 304 fast-path if this hasn't resolved yet.
 */
function seedEtagCacheInBackground(client: GitHubClient): void {
  loadCachedEtags()
    .then((etagEntries) => {
      if (etagEntries.length === 0) return;
      client.seedEtagCache(
        etagEntries.map((e) => ({
          url: e.url,
          etag: e.etag,
          data: e.jsonData,
        })),
      );
      log.info('seeded etag cache from SQLite', { count: etagEntries.length });
    })
    .catch((err) => {
      log.warn('failed to seed etag cache (continuing)', { error: String(err) });
    });
}

/**
 * Resolve the viewer login (best-effort, off the critical path) and persist
 * it to settings so the next launch has it before any network call.
 */
async function detectViewerLogin(token: string): Promise<void> {
  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'BorgDock' },
    });
    if (!resp.ok) {
      log.warn('username detection returned non-ok', { status: resp.status });
      return;
    }
    const data = await resp.json();
    const login: unknown = data?.login;
    if (typeof login !== 'string' || login.length === 0) return;
    usePrStore.getState().setUsername(login);
    log.info('detected GitHub username', { login });

    const settingsStore = useSettingsStore.getState();
    const current = settingsStore.settings.gitHub;
    if (current.username !== login) {
      settingsStore.updateSettings({ gitHub: { ...current, username: login } });
      log.info('persisted GitHub username to settings', { login });
    }
  } catch (err) {
    log.warn('username detection failed (best-effort)', { error: String(err) });
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function useInitSequence(settings: AppSettings, needsSetup: boolean) {
  const runIdRef = useRef(0);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const runToken = useInitStore((s) => s.runToken);

  useEffect(() => {
    // runToken is intentionally in deps — incremented by reset() to re-trigger
    void runToken;
    if (needsSetup) {
      log.debug('effect skipped — needsSetup is true');
      return;
    }

    const runId = ++runIdRef.current;
    const store = useInitStore.getState();
    if (store.isComplete) {
      log.debug('effect skipped — already complete', { runId });
      return;
    }

    const cancelled = () => runIdRef.current !== runId;
    const currentSettings = settingsRef.current;
    const sequenceStart = performance.now();
    log.info('init sequence starting', {
      runId,
      runToken,
      repoCount: currentSettings.repos.length,
      enabledRepos: currentSettings.repos.filter((r) => r.enabled).length,
      authMethod: currentSettings.gitHub.authMethod,
    });

    (async () => {
      // Step 1: Auth
      store.startStep('auth');
      log.info('step=auth start');
      const authStart = performance.now();
      let client: GitHubClient;
      const repoClients = new Map<string, GitHubClient>();
      try {
        const pat = currentSettings.gitHub.personalAccessToken;
        const tokenGetter = () => getGitHubToken(pat);
        client = initClient(tokenGetter);
        const clientsByAccount = new Map<string, GitHubClient>([['', client]]);
        for (const repo of currentSettings.repos) {
          const account = repo.githubAccount?.trim() || undefined;
          const accountKey = account?.toLowerCase() ?? '';
          let repoClient = clientsByAccount.get(accountKey);
          if (!repoClient) {
            repoClient = initClient(() => getGitHubToken(pat, account), account);
            clientsByAccount.set(accountKey, repoClient);
          }
          bindRepoClient(repo.owner, repo.name, account);
          repoClients.set(`${repo.owner}/${repo.name}`.toLowerCase(), repoClient);
        }

        // Username from settings first — "my PRs" / focus scoring work on the
        // very first render; the viewer lookup below refreshes it in the background.
        const savedUsername = currentSettings.gitHub.username?.trim() ?? '';
        if (savedUsername) {
          usePrStore.getState().setUsername(savedUsername);
          log.info('username seeded from settings', { login: savedUsername });
        }

        // Fire-and-forget: 500 rows with bodies — never block the splash on it.
        seedEtagCacheInBackground(client);
        for (const repoClient of new Set(repoClients.values())) {
          if (repoClient !== client) seedEtagCacheInBackground(repoClient);
        }

        const token = await log.time('getGitHubToken', () => tokenGetter());
        log.debug('obtained GitHub token', { tokenLength: token.length });

        // Fire-and-forget: the viewer lookup used to cost ~1.5 s of splash time.
        void detectViewerLogin(token);

        if (cancelled()) {
          log.debug('auth cancelled after success', { runId });
          return;
        }
        store.completeStep('auth');
        log.info('step=auth done', { durationMs: Math.round(performance.now() - authStart) });
      } catch (err) {
        if (cancelled()) {
          log.debug('auth cancelled during error path', { runId });
          return;
        }
        const message = err instanceof Error ? err.message : 'GitHub authentication failed';
        log.error('step=auth failed', err, {
          durationMs: Math.round(performance.now() - authStart),
        });
        store.failStep('auth', message);
        return;
      }

      // Step 2: Discover repos
      store.startStep('discover-repos');
      log.info('step=discover-repos start');
      const enabledRepos = currentSettings.repos.filter((r) => r.enabled);
      if (cancelled()) return;
      store.completeStep('discover-repos', { count: enabledRepos.length });
      log.info('step=discover-repos done', {
        enabled: enabledRepos.length,
        total: currentSettings.repos.length,
        repos: enabledRepos.map((r) => `${r.owner}/${r.name}`).join(','),
      });

      if (enabledRepos.length === 0) {
        log.info('no enabled repos — skipping fetch steps');
        store.completeStep('fetch-prs', { count: 0 });
        store.completeStep('fetch-checks');
        store.markComplete();
        try {
          await emitTo('flyout', 'init-complete', {});
        } catch (err) {
          log.warn('failed to emit init-complete to flyout', { error: String(err) });
        }
        return;
      }

      // Step 3: Fetch PRs — try cache first for instant startup, then refresh from API.
      store.startStep('fetch-prs');
      log.info('step=fetch-prs start', { repoCount: enabledRepos.length });
      const fetchStart = performance.now();

      // Try loading from SQLite cache first
      let usedCache = false;
      try {
        const perRepo = await Promise.all(
          enabledRepos.map((repo) => loadCachedPRs(repo.owner, repo.name)),
        );
        const cachedPrs = perRepo.flat() as PullRequestWithChecks[];
        if (cachedPrs.length > 0 && !cancelled()) {
          usePrStore.getState().setPullRequests(cachedPrs);
          usePrStore.getState().setPollingState(false, new Date());
          usedCache = true;
          log.info('step=fetch-prs seeded from cache', {
            count: cachedPrs.length,
            durationMs: Math.round(performance.now() - fetchStart),
          });
          store.completeStep('fetch-prs', { count: cachedPrs.length });
        }
      } catch (err) {
        log.warn('cache load failed (falling through to API)', { error: String(err) });
      }

      // Fetch fresh from API (blocking if no cache, background if cache was used)
      const rawPrs: { pr: PullRequest; owner: string; name: string }[] = [];
      const apiFetch = async () => {
        await Promise.all(
          enabledRepos.map(async (repo) => {
            const repoClient =
              repoClients.get(`${repo.owner}/${repo.name}`.toLowerCase()) ?? client;
            repoClient.markPollStart();
            const prs = await log.time(`getOpenPRs ${repo.owner}/${repo.name}`, () =>
              getOpenPRs(repoClient, repo.owner, repo.name, { hydrateDetails: false }),
            );
            log.debug('fetched PRs for repo', {
              repo: `${repo.owner}/${repo.name}`,
              count: prs.length,
            });
            for (const pr of prs) {
              rawPrs.push({ pr, owner: repo.owner, name: repo.name });
            }
          }),
        );
      };

      if (usedCache) {
        // Cache was used — fetch API in background, don't block init
        apiFetch()
          .then(() => {
            if (cancelled()) return;
            const freshPrs = rawPrs.map(({ pr }) => aggregatePrWithChecks(pr, []));
            usePrStore.getState().setPullRequests(freshPrs);
            usePrStore.getState().setPollingState(false, new Date());
            log.info('background API refresh done', { count: freshPrs.length });
          })
          .catch((err) => {
            if (cancelled()) return;
            log.warn('background API refresh failed (using cached data)', { error: String(err) });
          });
      } else {
        // No cache — block on API fetch (original behavior)
        try {
          await withTimeout(
            apiFetch(),
            FETCH_PRS_TIMEOUT_MS,
            'Fetching pull requests timed out. Check your connection or GitHub rate limits.',
          );
          if (cancelled()) return;
          store.completeStep('fetch-prs', { count: rawPrs.length });
          log.info('step=fetch-prs done', {
            totalPrs: rawPrs.length,
            durationMs: Math.round(performance.now() - fetchStart),
          });
        } catch (err) {
          if (cancelled()) return;
          const message = err instanceof Error ? err.message : 'Failed to fetch pull requests';
          log.error('step=fetch-prs failed', err, {
            durationMs: Math.round(performance.now() - fetchStart),
            collectedSoFar: rawPrs.length,
          });
          store.failStep('fetch-prs', message);
          return;
        }

        const initialPullRequests = rawPrs.map(({ pr }) => aggregatePrWithChecks(pr, []));
        if (cancelled()) return;
        usePrStore.getState().setPullRequests(initialPullRequests);
        usePrStore.getState().setPollingState(false, new Date());
        log.debug('seeded pr-store with initial PRs', { count: initialPullRequests.length });
      }

      // Step 4: Hand off check hydration to the normal polling path.
      // Blocking startup on per-PR check status makes the splash screen feel hung.
      store.startStep('fetch-checks');
      log.info('step=fetch-checks handoff — polling loop will hydrate checks');
      if (cancelled()) return;
      store.completeStep('fetch-checks');

      if (cancelled()) return;
      store.markComplete();
      log.info('init sequence complete', {
        runId,
        totalDurationMs: Math.round(performance.now() - sequenceStart),
      });
      try {
        await emitTo('flyout', 'init-complete', {});
      } catch (err) {
        log.warn('failed to emit init-complete to flyout', { error: String(err) });
      }
    })();
  }, [needsSetup, runToken]);
}
