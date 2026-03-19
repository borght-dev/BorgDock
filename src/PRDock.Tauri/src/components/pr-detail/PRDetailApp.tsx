import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useMemo, useState } from 'react';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { getCheckRunsForRef } from '@/services/github/checks';
import { GitHubClient } from '@/services/github/client';
import { getOpenPRs } from '@/services/github/pulls';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, CheckRun, PullRequestWithChecks } from '@/types';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { PRDetailPanel } from './PRDetailPanel';

export function PRDetailApp() {
  const [pr, setPr] = useState<PullRequestWithChecks | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse URL params
  const { owner, repo, number } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      owner: params.get('owner') ?? '',
      repo: params.get('repo') ?? '',
      number: Number(params.get('number')) || 0,
    };
  }, []);

  useEffect(() => {
    if (!owner || !repo || !number) {
      setError('Missing PR parameters (owner, repo, number)');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        // Load settings for theme + auth
        const settings = await invoke<AppSettings>('load_settings');
        useSettingsStore.setState({ settings, isLoading: false });

        // Apply theme
        const t = settings.ui?.theme ?? 'system';
        const isDark =
          t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);

        // Initialize GitHub client
        const pat = settings.gitHub.personalAccessToken;
        const tokenGetter = () => getGitHubToken(pat);
        const client = new GitHubClient(tokenGetter);

        // Fetch the specific PR
        const prs = await getOpenPRs(client, owner, repo);
        const targetPr = prs.find((p) => p.number === number);

        if (!targetPr) {
          setError(`PR #${number} not found in ${owner}/${repo}`);
          setIsLoading(false);
          return;
        }

        // Fetch checks
        let checks: CheckRun[];
        try {
          checks = await getCheckRunsForRef(client, owner, repo, targetPr.headRef);
        } catch {
          checks = [];
        }

        const prWithChecks = aggregatePrWithChecks(targetPr, checks);
        setPr(prWithChecks);

        // Update window title
        getCurrentWindow()
          .setTitle(`PR #${number} - ${targetPr.title}`)
          .catch(() => {});
      } catch (err) {
        console.error('Failed to load PR:', err);
        setError('Failed to load pull request');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [owner, repo, number]);

  const titleText = pr
    ? `PR #${number} — ${pr.pullRequest.title}`
    : number
      ? `PR #${number}`
      : 'Pull Request';

  if (error) {
    return (
      <div
        className="flex h-screen flex-col"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <WindowTitleBar title={titleText} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !pr) {
    return (
      <div
        className="flex h-screen flex-col"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <WindowTitleBar title={titleText} />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: 'var(--color-surface)' }}>
      <WindowTitleBar title={titleText} />
      <div className="relative flex-1 overflow-y-auto">
        <PRDetailPanel pr={pr} />
      </div>
    </div>
  );
}
