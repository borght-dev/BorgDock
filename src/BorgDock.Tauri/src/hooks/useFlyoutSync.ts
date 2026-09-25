import { useEffect, useRef } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { computeMergeScore } from '@/services/merge-score';
import { OPEN_PR_DETAIL_EVENT, type ShowPrTarget, showPr } from '@/services/navigation';
import { sendOsNotification } from '@/services/notification';
import { type PrActionId, workbenchPrimaryAction } from '@/services/pr-action-resolver';
import {
  checkoutPrBranch,
  mergePr,
  openPrInBrowser,
  rerunChecks,
  reviewPr,
} from '@/services/pr-actions';
import { requestT3Thread } from '@/services/t3-thread';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3SessionStore } from '@/stores/t3-session-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';

type TrayWorstState = 'failing' | 'pending' | 'passing' | 'idle';

function deriveWorstState(prs: PullRequestWithChecks[]): TrayWorstState {
  if (prs.length === 0) return 'idle';
  if (prs.some((p) => p.overallStatus === 'red')) return 'failing';
  if (prs.some((p) => p.overallStatus === 'yellow')) return 'pending';
  return 'passing';
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** `open-pr-detail` payload: `showPr`'s target, or just a number from older emitters. */
type OpenPrDetailPayload = Partial<ShowPrTarget> & { number: number };

/** Opens the PR another window asked for; see the `open-pr-detail` listener. */
export async function openPrFromEvent(payload: OpenPrDetailPayload): Promise<void> {
  const { number, tab } = payload;
  let { owner, repo } = payload;
  if (!owner || !repo) {
    const prw = usePrStore.getState().pullRequests.find((p) => p.pullRequest.number === number);
    if (!prw) return;
    owner = prw.pullRequest.repoOwner;
    repo = prw.pullRequest.repoName;
  }
  await bringMainWindowForward();
  await showPr({ owner, repo, number, ...(tab ? { tab } : {}) });
}

/**
 * Show, restore and focus this (the main) window. Not `show_or_focus_main`:
 * that command toggles, and hides a window that is already focused.
 */
async function bringMainWindowForward(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.unminimize().catch(() => {});
    await win.show();
    await win.setFocus();
  } catch {
    // Still push the view; the window may already be showing.
  }
}

/**
 * The flyout's Review (its row action and context menu, `flyout-pr-action`
 * with `action: 'review'`): the main window comes to the front and opens
 * Quick Review for the PR, the same `reviewPr` the main window's rows use.
 */
export async function reviewFromFlyout(prw: PullRequestWithChecks): Promise<void> {
  await bringMainWindowForward();
  reviewPr(prw);
}

/** `flyout-pr-action` payload: a row action or context-menu item in the flyout. */
export interface FlyoutPrActionPayload {
  repoOwner: string;
  repoName: string;
  number: number;
  action: PrActionId | 'more';
  failedCheckNames: string[];
}

/**
 * Runs a flyout PR action in the main window, which owns the live pr-store.
 * The switch dispatches to the same pr-actions module the main window's rows
 * use, so celebration, refresh and error reporting behave the same whichever
 * surface fired it. Review opens Quick Review here (the main window comes to
 * the front); Open goes to GitHub.
 */
export async function handleFlyoutPrAction(payload: FlyoutPrActionPayload): Promise<void> {
  const { repoOwner, repoName, number, action } = payload;
  const prw = usePrStore
    .getState()
    .pullRequests.find(
      (p) =>
        p.pullRequest.repoOwner === repoOwner &&
        p.pullRequest.repoName === repoName &&
        p.pullRequest.number === number,
    );
  if (!prw) return;
  const pr = prw.pullRequest;
  const prRef = {
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    number: pr.number,
    title: pr.title,
    htmlUrl: pr.htmlUrl,
  };
  switch (action) {
    case 'rerun': {
      if (prw.failedCheckNames.length > 0) {
        void rerunChecks({
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          ref: pr.headSha || pr.headRef,
        });
      }
      break;
    }
    case 'merge': {
      void mergePr(prRef);
      break;
    }
    case 'review': {
      await reviewFromFlyout(prw);
      break;
    }
    case 'open': {
      void openPrInBrowser(pr.htmlUrl);
      break;
    }
    case 'checkout': {
      void checkoutPrBranch({
        repoOwner: pr.repoOwner,
        repoName: pr.repoName,
        headRef: pr.headRef,
      });
      break;
    }
    case 'more': {
      // 'more' is handled entirely in the flyout window (via
      // FlyoutPrContextMenu). Drop stale events on the floor.
      break;
    }
  }
}

/**
 * Build the payload for the flyout window. Each PR carries its
 * `primaryAction`, worked out here with the main window's rule
 * (`workbenchPrimaryAction`, which knows the user and their teams), so the
 * flyout row only draws it.
 */
export function buildFlyoutPayload(
  pullRequests: PullRequestWithChecks[],
  username: string,
  theme: string,
  hotkey: string,
  lastPollTime: number | null,
  focusCount: number,
  reduceMotion: boolean,
  teams: readonly string[] = [],
) {
  const lowerUser = username.toLowerCase();
  const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
  const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;
  const passingCount = pullRequests.filter((p) => p.overallStatus === 'green').length;

  const lastSyncAgo = lastPollTime ? formatTimeAgo(new Date(lastPollTime).toISOString()) : '...';

  return {
    pullRequests: pullRequests.map((pr) => ({
      number: pr.pullRequest.number,
      title: pr.pullRequest.title,
      repoOwner: pr.pullRequest.repoOwner,
      repoName: pr.pullRequest.repoName,
      authorLogin: pr.pullRequest.authorLogin,
      authorAvatarUrl: pr.pullRequest.authorAvatarUrl,
      overallStatus: pr.overallStatus,
      reviewStatus: pr.pullRequest.reviewStatus,
      failedCount: pr.failedCheckNames.length,
      failedCheckNames: pr.failedCheckNames,
      pendingCount: pr.pendingCheckNames.length,
      passedCount: pr.passedCount,
      totalChecks: pr.totalCheckCount,
      commentCount: pr.pullRequest.commentCount,
      isMine: lowerUser ? pr.pullRequest.authorLogin.toLowerCase() === lowerUser : false,
      // Included so the flyout's context menu can copy locally without
      // round-tripping the data through an event.
      htmlUrl: pr.pullRequest.htmlUrl,
      headRef: pr.pullRequest.headRef,
      isDraft: pr.pullRequest.isDraft,
      mergeScore: computeMergeScore(pr),
      mergeable: pr.pullRequest.mergeable,
      relevantChecks: pr.totalCheckCount - pr.skippedCount,
      baseRef: pr.pullRequest.baseRef,
      additions: pr.pullRequest.additions ?? 0,
      deletions: pr.pullRequest.deletions ?? 0,
      labels: pr.pullRequest.labels,
      primaryAction: workbenchPrimaryAction(pr, username, teams),
    })),
    failingCount,
    pendingCount,
    passingCount,
    totalCount: pullRequests.length,
    focusCount,
    username,
    theme,
    reduceMotion,
    lastSyncAgo,
    hotkey,
  };
}

export function useFlyoutSync() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const lastPollTimeRaw = usePrStore((s) => s.lastPollTime);
  const lastPollTime = lastPollTimeRaw ? lastPollTimeRaw.getTime() : null;
  const theme = useSettingsStore((s) => s.settings.ui.theme);
  const reduceMotion = useSettingsStore((s) => s.settings.ui.reduceMotion ?? false);
  const hotkey = useSettingsStore((s) => s.settings.ui.globalHotkey);
  const agentAwaitingCount = useT3SessionStore(
    (s) =>
      s.sessions.filter(
        (session) => session.status === 'waitingApproval' || session.status === 'waitingInput',
      ).length,
  );

  // Debounced sync — skip when nothing has changed
  const prevHashRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Build the live flyout payload from the current store snapshot, push it
   * into the Rust-side cache (`cache_flyout_data`), and broadcast it to any
   * open flyout window (`flyout-update`). Both sides do the same work, so
   * the request-listener path also caches — previously it skipped the cache
   * and the next cold-open of the flyout read stale data.
   */
  const syncFlyout = async (): Promise<void> => {
    const prs = usePrStore.getState().pullRequests;
    const user = usePrStore.getState().username;
    const pollRaw = usePrStore.getState().lastPollTime;
    const st = useSettingsStore.getState().settings;
    const payload = buildFlyoutPayload(
      prs,
      user,
      st.ui.theme,
      st.ui.globalHotkey || 'Ctrl+Win+Shift+G',
      pollRaw ? pollRaw.getTime() : null,
      usePrStore.getState().focusCount(),
      st.ui.reduceMotion ?? false,
      usePrStore.getState().teams,
    );
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cache_flyout_data', { payload: JSON.stringify(payload) });
    } catch {
      // ignore — Rust cache may not exist on older builds
    }
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('flyout', 'flyout-update', payload);
    } catch {
      // ignore — flyout window may not exist yet
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncFlyout is a stable closure over store getters; username and hotkey are intentional hash inputs included in the effect body indirectly via the hash string, not consumed as direct deps.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const count = pullRequests.length;
      const worstState = deriveWorstState(pullRequests);
      const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
      const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;

      // Cheap hash to skip redundant IPC
      const hash = `${count}:${worstState}:${failingCount}:${pendingCount}:${theme}:${reduceMotion}:${lastPollTime}:${agentAwaitingCount}`;
      if (hash === prevHashRef.current) return;
      prevHashRef.current = hash;

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const totalCount = count + agentAwaitingCount;

        // Update tray icon badge
        await invoke('update_tray_icon', {
          count: Math.min(totalCount, 255),
          worstState: agentAwaitingCount > 0 ? 'pending' : worstState,
        });

        // Update tray tooltip
        const parts: string[] = [`BorgDock — ${count} open PRs`];
        if (failingCount > 0) parts.push(`${failingCount} failing`);
        if (pendingCount > 0) parts.push(`${pendingCount} pending`);
        if (agentAwaitingCount > 0) parts.push(`${agentAwaitingCount} T3 sessions waiting`);
        await invoke('update_tray_tooltip', { tooltip: parts.join(' · ') });
      } catch {
        // ignore — commands may not exist on older builds
      }

      await syncFlyout();
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pullRequests, username, theme, reduceMotion, hotkey, lastPollTime, agentAwaitingCount]);

  // Respond to flyout-request-data: re-send the current payload through the
  // same syncFlyout helper so the cache and the broadcast stay in sync.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot mount effect; syncFlyout is a stable closure and the listener should register only once.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('flyout-request-data', () => {
          void syncFlyout();
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Listen for expand-sidebar events (from flyout or other windows)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('expand-sidebar', async () => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('show_or_focus_main');
          } catch {
            // ignore
          }
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Listen for open-pr-detail events from other windows (the flyout's
  // `showPr`): the main window comes to the front and pushes the detail
  // view. Emitters that only send a number get owner/repo from the
  // in-memory PR list.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<OpenPrDetailPayload>(OPEN_PR_DETAIL_EVENT, (event) => {
          void openPrFromEvent(event.payload);
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Listen for fix/monitor events from flyout window
  const { fixWithClaude, monitorPr } = useClaudeActions();
  const fixRef = useRef(fixWithClaude);
  const monitorRef = useRef(monitorPr);
  useEffect(() => {
    fixRef.current = fixWithClaude;
    monitorRef.current = monitorPr;
  }, [fixWithClaude, monitorPr]);

  useEffect(() => {
    let unlistenFix: (() => void) | undefined;
    let unlistenMonitor: (() => void) | undefined;
    let unlistenT3: (() => void) | undefined;
    let unlistenAction: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const fnFix = await listen<{
          repoOwner: string;
          repoName: string;
          number: number;
          failedCheckNames: string[];
        }>('flyout-fix-pr', (event) => {
          const { repoOwner, repoName, number, failedCheckNames } = event.payload;
          const pr = usePrStore
            .getState()
            .pullRequests.find(
              (p) =>
                p.pullRequest.repoOwner === repoOwner &&
                p.pullRequest.repoName === repoName &&
                p.pullRequest.number === number,
            );
          if (pr) {
            fixRef
              .current(pr, failedCheckNames.length > 0 ? failedCheckNames : ['unknown'], [], [], '')
              .catch(console.error);
          }
        });

        const fnMonitor = await listen<{ repoOwner: string; repoName: string; number: number }>(
          'flyout-monitor-pr',
          (event) => {
            const { repoOwner, repoName, number } = event.payload;
            const pr = usePrStore
              .getState()
              .pullRequests.find(
                (p) =>
                  p.pullRequest.repoOwner === repoOwner &&
                  p.pullRequest.repoName === repoName &&
                  p.pullRequest.number === number,
              );
            if (pr) {
              monitorRef.current(pr).catch(console.error);
            }
          },
        );

        const fnT3 = await listen<{ repoOwner: string; repoName: string; number: number }>(
          'flyout-open-t3-thread',
          (event) => {
            const { repoOwner, repoName, number } = event.payload;
            const pr = usePrStore
              .getState()
              .pullRequests.find(
                (p) =>
                  p.pullRequest.repoOwner === repoOwner &&
                  p.pullRequest.repoName === repoName &&
                  p.pullRequest.number === number,
              );
            if (pr) {
              requestT3Thread(pr.pullRequest).catch((err) => {
                void sendOsNotification({
                  title: 'Open in T3 failed',
                  body: parseError(err).message,
                  severity: 'error',
                }).catch(() => {});
              });
            }
          },
        );

        const fnAction = await listen<FlyoutPrActionPayload>('flyout-pr-action', (event) =>
          handleFlyoutPrAction(event.payload),
        );

        if (cancelled) {
          fnFix();
          fnMonitor();
          fnT3();
          fnAction();
          return;
        }
        unlistenFix = fnFix;
        unlistenMonitor = fnMonitor;
        unlistenT3 = fnT3;
        unlistenAction = fnAction;
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      unlistenFix?.();
      unlistenMonitor?.();
      unlistenT3?.();
      unlistenAction?.();
    };
  }, []);
}
