import { useEffect, useRef } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { BadgeStyle, PullRequestWithChecks } from '@/types';

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

function formatShortAgo(dateStr: string): string {
  return formatTimeAgo(dateStr);
}

type StatusColor = 'green' | 'red' | 'yellow';

function prItemStatusColor(pr: PullRequestWithChecks): StatusColor {
  if (pr.overallStatus === 'red') return 'red';
  if (pr.overallStatus === 'yellow') return 'yellow';
  return 'green';
}

/** Build the payload for the floating badge window */
function buildBadgePayload(
  pullRequests: PullRequestWithChecks[],
  username: string,
  theme: string,
  badgeStyle: BadgeStyle,
  notificationCount: number,
) {
  const lowerUser = username.toLowerCase();
  const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
  const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;

  const toBadgeItem = (pr: PullRequestWithChecks) => {
    const passed = pr.passedCount;
    const total = pr.checks.length;
    return {
      title: pr.pullRequest.title,
      number: pr.pullRequest.number,
      timeAgo: formatShortAgo(pr.pullRequest.updatedAt),
      statusColor: prItemStatusColor(pr),
      checksText: total > 0 ? `${passed}/${total}` : undefined,
      isInProgress: pr.overallStatus === 'yellow',
      repoOwner: pr.pullRequest.repoOwner,
      repoName: pr.pullRequest.repoName,
    };
  };

  const myPrs = pullRequests
    .filter((pr) => lowerUser && pr.pullRequest.authorLogin.toLowerCase() === lowerUser)
    .map(toBadgeItem);
  const teamPrs = pullRequests
    .filter((pr) => !lowerUser || pr.pullRequest.authorLogin.toLowerCase() !== lowerUser)
    .map(toBadgeItem);

  return {
    totalPrCount: pullRequests.length,
    failingCount,
    pendingCount,
    notificationCount,
    myPrs,
    teamPrs,
    badgeStyle,
    theme,
  };
}

/** Build the payload for the flyout window */
function buildFlyoutPayload(
  pullRequests: PullRequestWithChecks[],
  username: string,
  theme: string,
  hotkey: string,
  lastPollTime: number | null,
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
      totalChecks: pr.checks.length,
      commentCount: pr.pullRequest.commentCount,
      isMine: lowerUser ? pr.pullRequest.authorLogin.toLowerCase() === lowerUser : false,
    })),
    failingCount,
    pendingCount,
    passingCount,
    totalCount: pullRequests.length,
    username,
    theme,
    lastSyncAgo,
    hotkey,
  };
}

export function useBadgeSync() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const lastPollTimeRaw = usePrStore((s) => s.lastPollTime);
  const lastPollTime = lastPollTimeRaw ? lastPollTimeRaw.getTime() : null;
  const theme = useSettingsStore((s) => s.settings.ui.theme);
  const hotkey = useSettingsStore((s) => s.settings.ui.globalHotkey);
  const badgeEnabled = useSettingsStore((s) => s.settings.ui.badgeEnabled);
  const badgeStyle = useSettingsStore((s) => s.settings.ui.badgeStyle);
  const activeNotifs = useNotificationStore((s) => s.active);
  const queuedNotifs = useNotificationStore((s) => s.queue);
  const notificationCount = activeNotifs.length + queuedNotifs.length;

  // Debounced sync — skip when nothing has changed
  const prevHashRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const count = pullRequests.length;
      const worstState = deriveWorstState(pullRequests);
      const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
      const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;

      // Cheap hash to skip redundant IPC
      const hash = `${count}:${worstState}:${failingCount}:${pendingCount}:${theme}:${lastPollTime}`;
      if (hash === prevHashRef.current) return;
      prevHashRef.current = hash;

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // Update tray icon badge
        await invoke('update_tray_icon', {
          count: Math.min(count, 255),
          worstState,
        });

        // Update tray tooltip
        const parts: string[] = [`BorgDock — ${count} open PRs`];
        if (failingCount > 0) parts.push(`${failingCount} failing`);
        if (pendingCount > 0) parts.push(`${pendingCount} pending`);
        await invoke('update_tray_tooltip', { tooltip: parts.join(' · ') });
      } catch {
        // ignore — commands may not exist on older builds
      }

      // Build the flyout payload and cache it in Rust state so the flyout
      // can fetch it directly via IPC (hidden WebView2 windows on Windows
      // have suspended JS and can't relay events).
      const payload = buildFlyoutPayload(
        pullRequests,
        username,
        theme,
        hotkey || 'Ctrl+Win+Shift+G',
        lastPollTime,
      );
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('cache_flyout_data', { payload: JSON.stringify(payload) });
      } catch {
        // ignore
      }

      // Also emit to the flyout directly if it's open
      try {
        const { emitTo } = await import('@tauri-apps/api/event');
        await emitTo('flyout', 'flyout-update', payload);
      } catch {
        // ignore — flyout window may not exist yet
      }

      // Floating badge: emit a badge-update so BadgeApp can redraw. We always
      // build + emit the payload regardless of badgeEnabled — the badge window
      // is either hidden or not created when disabled, so the emit is a no-op
      // in that case and keeps the code path simple.
      if (badgeEnabled) {
        try {
          const badgePayload = buildBadgePayload(
            pullRequests,
            username,
            theme,
            badgeStyle,
            notificationCount,
          );
          const { emitTo } = await import('@tauri-apps/api/event');
          await emitTo('badge', 'badge-update', badgePayload);
        } catch {
          // ignore — badge window may not exist yet
        }
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pullRequests, username, theme, hotkey, lastPollTime, badgeEnabled, badgeStyle, notificationCount]);

  // Respond to flyout-request-data: re-send current payload
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('flyout-request-data', async () => {
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
          );
          console.log('[BadgeSync] Responding to flyout-request-data, PRs:', prs.length);
          const { emitTo } = await import('@tauri-apps/api/event');
          await emitTo('flyout', 'flyout-update', payload);
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

  // Respond to badge-request-data: re-send current payload to the badge window
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('badge-request-data', async () => {
          const prs = usePrStore.getState().pullRequests;
          const user = usePrStore.getState().username;
          const st = useSettingsStore.getState().settings;
          const notifs = useNotificationStore.getState();
          const payload = buildBadgePayload(
            prs,
            user,
            st.ui.theme,
            st.ui.badgeStyle,
            notifs.active.length + notifs.queue.length,
          );
          console.log('[BadgeSync] Responding to badge-request-data, PRs:', prs.length);
          const { emitTo } = await import('@tauri-apps/api/event');
          await emitTo('badge', 'badge-update', payload);
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
            await invoke('toggle_sidebar');
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

  // Listen for open-pr-detail events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ number: number }>('open-pr-detail', (event) => {
          useUiStore.getState().selectPr(event.payload.number);
          useUiStore.getState().setSidebarVisible(true);
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
  fixRef.current = fixWithClaude;
  const monitorRef = useRef(monitorPr);
  monitorRef.current = monitorPr;

  useEffect(() => {
    let unlistenFix: (() => void) | undefined;
    let unlistenMonitor: (() => void) | undefined;
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

        if (cancelled) {
          fnFix();
          fnMonitor();
          return;
        }
        unlistenFix = fnFix;
        unlistenMonitor = fnMonitor;
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      unlistenFix?.();
      unlistenMonitor?.();
    };
  }, []);
}
