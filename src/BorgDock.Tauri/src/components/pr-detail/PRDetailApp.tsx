import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { T3CheckoutDialog } from '@/components/pr/T3CheckoutDialog';
import { IconButton } from '@/components/shared/primitives';
import { usePrDetailData } from '@/hooks/usePrDetailData';
import { getGitHubToken } from '@/services/github/auth';
import { initClient } from '@/services/github/singleton';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types';
import { revealWindow } from '@/utils/window-reveal';
import { PrDetailPanel } from './PRDetailPanel';

/**
 * Read params. Primary source is the global injected by Rust via
 * initialization_script — URL query strings don't round-trip through
 * WebviewUrl::App reliably on Windows (the '?' gets percent-encoded).
 * We still fall back to URLSearchParams so manual dev (e.g. opening the
 * page in a browser) keeps working.
 */
function readPrParams(): { owner: string; repo: string; number: number } {
  const injected = (
    window as unknown as {
      __BORGDOCK_PR_DETAIL__?: { owner?: string; repo?: string; number?: number };
    }
  ).__BORGDOCK_PR_DETAIL__;
  if (injected?.owner && injected.repo && injected.number) {
    return { owner: injected.owner, repo: injected.repo, number: injected.number };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    owner: params.get('owner') ?? '',
    repo: params.get('repo') ?? '',
    number: Number(params.get('number')) || 0,
  };
}

/**
 * The pop-out window's own setup: it has its own stores, so it loads the
 * settings and creates the GitHub client itself before `usePrDetailData`
 * fetches anything. The theme is the entry's job (startWindowTheme in
 * pr-detail-main.tsx).
 */
async function preparePopOut() {
  const settings = await invoke<AppSettings>('load_settings');
  useSettingsStore.setState({ settings, isLoading: false });

  try {
    await invoke('cache_init');
  } catch {
    // The cache is best-effort.
  }

  const pat = settings.gitHub.personalAccessToken;
  return initClient(() => getGitHubToken(pat));
}

/** PrDetailApp — the pop-out PR detail window (`pr-detail.html`). */
export function PrDetailApp() {
  // Reveal the (invisible-built) window once React has painted.
  const revealedRef = useRef(false);
  useEffect(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    requestAnimationFrame(() => {
      void revealWindow();
    });
  }, []);

  const target = useMemo(readPrParams, []);
  const { pr, checks, isLoading, error } = usePrDetailData(target, { prepare: preparePopOut });
  const { number } = target;

  const title = pr?.pullRequest.title;
  useEffect(() => {
    if (!title) return;
    getCurrentWindow().setTitle(`PR #${number} - ${title}`).catch(console.debug);
  }, [number, title]);

  // Thin header strip for pre-load states — stays draggable so the window
  // can be moved even before the PR data has finished loading, and keeps a
  // close button reachable in case the load hangs.
  const closeThisWindow = useCallback(() => {
    getCurrentWindow()
      .close()
      .catch((err) => console.error('close window failed', err));
  }, []);
  const preloadHeader = (
    <div
      data-tauri-drag-region
      className="flex h-9 items-center justify-between border-b border-[var(--color-separator)] px-3 text-xs text-[var(--color-text-muted)]"
    >
      <span data-tauri-drag-region className="truncate">
        {number ? `PR #${number}` : 'Pull Request'}
      </span>
      <IconButton
        icon={<X size={10} strokeWidth={2.9} aria-hidden="true" />}
        tooltip="Close"
        size={22}
        aria-label="Close"
        onClick={closeThisWindow}
        data-pr-detail-close
      />
    </div>
  );

  // Playwright wait-target: the first IPC roundtrip (load_settings + cache
  // peek) has resolved; the window is rendering its real surface (error,
  // spinner-with-cached-PR, or detail panel). Absent until `isLoading`
  // flips to false.
  const appReady = !isLoading ? 'true' : undefined;

  if (error && !pr) {
    return (
      <div
        className="flex h-screen flex-col bg-[var(--color-background)]"
        data-app-ready={appReady}
      >
        {preloadHeader}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-[var(--color-text-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !pr) {
    return (
      <div
        className="flex h-screen flex-col bg-[var(--color-background)]"
        data-app-ready={appReady}
      >
        {preloadHeader}
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]" data-app-ready={appReady}>
      <div className="relative flex-1 overflow-y-auto">
        <PrDetailPanel pr={pr} checks={checks} popOutWindow />
      </div>
      <T3CheckoutDialog />
    </div>
  );
}
