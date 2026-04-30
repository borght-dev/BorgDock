import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NotificationOverlay } from '@/components/notifications/NotificationOverlay';
import { IconButton } from '@/components/shared/primitives';
import { loadCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getGitHubToken } from '@/services/github/auth';
import { getCheckRunsForRef } from '@/services/github/checks';
import { getOpenPRs } from '@/services/github/pulls';
import { initClient } from '@/services/github/singleton';
import {
  PR_REFRESHED_EVENT,
  type PrRefreshedDetail,
} from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, CheckRun, PullRequestWithChecks } from '@/types';
import { PrDetailPanel } from './PRDetailPanel';

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M2 2l6 6M8 2l-6 6"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export function PrDetailApp() {
  const [pr, setPr] = useState<PullRequestWithChecks | null>(null);
  const prRef = useRef<PullRequestWithChecks | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref alongside the state so the load effect can check the latest
  // value without taking pr as a dependency (which would cause re-entry).
  useEffect(() => {
    prRef.current = pr;
  }, [pr]);

  // Read params. Primary source is the global injected by Rust via
  // initialization_script — URL query strings don't round-trip through
  // WebviewUrl::App reliably on Windows (the '?' gets percent-encoded).
  // We still fall back to URLSearchParams so manual dev (e.g. opening
  // the page in a browser) keeps working.
  const { owner, repo, number } = useMemo(() => {
    const injected = (
      window as unknown as {
        __BORGDOCK_PR_DETAIL__?: { owner?: string; repo?: string; number?: number };
      }
    ).__BORGDOCK_PR_DETAIL__;
    if (injected?.owner && injected.repo && injected.number) {
      return {
        owner: injected.owner,
        repo: injected.repo,
        number: injected.number,
      };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      owner: params.get('owner') ?? '',
      repo: params.get('repo') ?? '',
      number: Number(params.get('number')) || 0,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!owner || !repo || !number) {
      setError('Missing PR parameters (owner, repo, number)');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        // Load settings for theme + auth
        const settings = await invoke<AppSettings>('load_settings');
        if (cancelled) return;
        useSettingsStore.setState({ settings, isLoading: false });

        // Apply theme
        const t = settings.ui?.theme ?? 'system';
        const isDark =
          t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (cancelled) return;
        document.documentElement.classList.toggle('dark', isDark);

        // Try loading from cache first for instant display
        try {
          await invoke('cache_init');
          if (cancelled) return;
          const cached = await loadCachedPRs(owner, repo);
          if (cancelled) return;
          const cachedPr = cached.find(
            (raw) => (raw as PullRequestWithChecks).pullRequest?.number === number,
          ) as PullRequestWithChecks | undefined;
          if (cachedPr) {
            if (cancelled) return;
            setPr(cachedPr);
            setIsLoading(false);
            getCurrentWindow()
              .setTitle(`PR #${number} - ${cachedPr.pullRequest.title}`)
              .catch(console.debug);
          }
        } catch {
          // Cache load is best-effort
        }

        if (cancelled) return;

        // Initialize GitHub client
        const pat = settings.gitHub.personalAccessToken;
        const tokenGetter = () => getGitHubToken(pat);
        const client = initClient(tokenGetter);

        // Fetch the specific PR (refreshes cached data)
        const prs = await getOpenPRs(client, owner, repo);
        if (cancelled) return;
        const targetPr = prs.find((p) => p.number === number);

        if (!targetPr) {
          if (cancelled) return;
          if (!prRef.current) {
            setError(`PR #${number} not found in ${owner}/${repo}`);
            setIsLoading(false);
          }
          return;
        }

        // Fetch checks
        let checks: CheckRun[];
        try {
          checks = await getCheckRunsForRef(client, owner, repo, targetPr.headRef);
        } catch {
          checks = [];
        }

        if (cancelled) return;
        const prWithChecks = aggregatePrWithChecks(targetPr, checks);
        setPr(prWithChecks);

        // Update window title
        getCurrentWindow()
          .setTitle(`PR #${number} - ${targetPr.title}`)
          .catch(console.debug); /* fire-and-forget */
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load PR:', err);
        if (!prRef.current) setError('Failed to load pull request');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, number]);

  // Pop-out windows hold their own pr state (this window's zustand store is
  // separate from the sidebar's), so subscribe to the in-window
  // borgdock-pr-refreshed event that mutation handlers fire after a successful
  // action. Keeps this view in sync with server-truth without waiting on the
  // next poll cycle.
  useEffect(() => {
    if (!owner || !repo || !number) return;
    function handleRefreshed(e: Event) {
      const detail = (e as CustomEvent<PrRefreshedDetail>).detail;
      if (!detail || detail.owner !== owner || detail.repo !== repo || detail.number !== number) {
        return;
      }
      if (detail.pr) {
        setPr(detail.pr);
        getCurrentWindow()
          .setTitle(`PR #${number} - ${detail.pr.pullRequest.title}`)
          .catch(console.debug); /* fire-and-forget */
      }
    }
    document.addEventListener(PR_REFRESHED_EVENT, handleRefreshed);
    return () => document.removeEventListener(PR_REFRESHED_EVENT, handleRefreshed);
  }, [owner, repo, number]);

  // Thin header strip for pre-load states — stays draggable so the window
  // can be moved even before the PR data has finished loading, and keeps a
  // close button reachable in case the load hangs.
  const closeThisWindow = () => {
    getCurrentWindow()
      .close()
      .catch((err) => console.error('close window failed', err));
  };
  const preloadHeader = (
    <div
      data-tauri-drag-region
      className="flex h-9 items-center justify-between border-b border-[var(--color-separator)] px-3 text-xs text-[var(--color-text-muted)]"
    >
      <span data-tauri-drag-region className="truncate">
        {number ? `PR #${number}` : 'Pull Request'}
      </span>
      <IconButton
        icon={<XIcon />}
        tooltip="Close"
        size={22}
        aria-label="Close"
        onClick={closeThisWindow}
        data-pr-detail-close
      />
    </div>
  );

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[var(--color-background)]">
        {preloadHeader}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-[var(--color-text-muted)]">
            {error}
          </p>
        </div>
        <NotificationOverlay />
      </div>
    );
  }

  if (isLoading || !pr) {
    return (
      <div className="flex h-screen flex-col bg-[var(--color-background)]">
        {preloadHeader}
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
        </div>
        <NotificationOverlay />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <div className="relative flex-1 overflow-y-auto">
        <PrDetailPanel pr={pr} popOutWindow />
      </div>
      <NotificationOverlay />
    </div>
  );
}
