import { useEffect, useRef } from 'react';
import type { BadgePrItem, StatusColor } from '@/components/badge/FloatingBadge';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';

function toStatusColor(status: string): StatusColor {
  if (status === 'red') return 'red';
  if (status === 'yellow') return 'yellow';
  return 'green';
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

function toBadgePrItem(pr: PullRequestWithChecks): BadgePrItem {
  const p = pr.pullRequest;
  const total = pr.checks.length;
  const passed = pr.passedCount;
  return {
    title: p.title,
    number: p.number,
    timeAgo: formatTimeAgo(p.updatedAt),
    statusColor: toStatusColor(pr.overallStatus),
    checksText: total > 0 ? `${passed}/${total}` : undefined,
    isInProgress: pr.overallStatus === 'yellow',
    repoOwner: p.repoOwner,
    repoName: p.repoName,
  };
}

export interface BadgeUpdatePayload {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  notificationCount: number;
  myPrs: BadgePrItem[];
  teamPrs: BadgePrItem[];
  badgeStyle: string;
  theme: string;
}

function buildBadgePayload(
  pullRequests: PullRequestWithChecks[],
  username: string,
  badgeStyle: string,
  theme: string,
  notificationCount: number,
): BadgeUpdatePayload {
  const failingCount = pullRequests.filter((p) => p.overallStatus === 'red').length;
  const pendingCount = pullRequests.filter((p) => p.overallStatus === 'yellow').length;

  const lowerUser = username.toLowerCase();
  const myPrs = pullRequests
    .filter((p) => lowerUser && p.pullRequest.authorLogin.toLowerCase() === lowerUser)
    .map(toBadgePrItem);

  const teamPrs = pullRequests
    .filter((p) => !lowerUser || p.pullRequest.authorLogin.toLowerCase() !== lowerUser)
    .map(toBadgePrItem);

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

async function sendToBadge(payload: BadgeUpdatePayload) {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    console.log('[BadgeSync] Sending badge-update:', {
      totalPrCount: payload.totalPrCount,
      failingCount: payload.failingCount,
      pendingCount: payload.pendingCount,
      myPrs: payload.myPrs.length,
      teamPrs: payload.teamPrs.length,
      badgeStyle: payload.badgeStyle,
      theme: payload.theme,
    });
    // Broadcast globally — the badge window picks it up via listen()
    await emit('badge-update', payload);
    console.log('[BadgeSync] badge-update emitted successfully');
  } catch (err) {
    console.error('[BadgeSync] Failed to emit badge-update:', err);
  }
}

async function updateTrayTooltip(payload: BadgeUpdatePayload) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const parts: string[] = [`PRDock — ${payload.totalPrCount} open PRs`];
    if (payload.failingCount > 0) parts.push(`${payload.failingCount} failing`);
    if (payload.pendingCount > 0) parts.push(`${payload.pendingCount} pending`);
    await invoke('update_tray_tooltip', { tooltip: parts.join(' · ') });
  } catch {
    // ignore — command may not exist on older builds
  }
}

export function useBadgeSync() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const badgeEnabled = useSettingsStore((s) => s.settings.ui.badgeEnabled);
  const badgeStyle = useSettingsStore((s) => s.settings.ui.badgeStyle);
  const theme = useSettingsStore((s) => s.settings.ui.theme);
  const notificationCount = useNotificationStore(
    (s) => s.notifications.length + (s.activeNotification ? 1 : 0),
  );

  // Debounced badge sync — skip emits when counts haven't changed
  const prevHashRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const payload = buildBadgePayload(pullRequests, username, badgeStyle, theme, notificationCount);
      // Cheap hash: skip IPC if aggregate counts are identical
      const hash = `${payload.totalPrCount}:${payload.failingCount}:${payload.pendingCount}:${payload.notificationCount}:${payload.badgeStyle}:${payload.theme}:${badgeEnabled}`;
      if (hash === prevHashRef.current) return;
      prevHashRef.current = hash;

      // Always update the tray tooltip with PR counts
      updateTrayTooltip(payload);

      if (badgeEnabled) {
        sendToBadge(payload);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pullRequests, username, badgeEnabled, badgeStyle, theme, notificationCount]);

  // When badge is disabled, immediately hide it
  useEffect(() => {
    if (!badgeEnabled) {
      (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('hide_badge');
        } catch {
          // ignore
        }
      })();
    }
  }, [badgeEnabled]);

  // Respond to badge-request-data: re-send current payload
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('badge-request-data', () => {
          const prs = usePrStore.getState().pullRequests;
          const user = usePrStore.getState().username;
          const st = useSettingsStore.getState().settings;
          const ns = useNotificationStore.getState();
          const nc = ns.notifications.length + (ns.activeNotification ? 1 : 0);
          console.log(
            '[BadgeSync] Received badge-request-data, PRs in store:',
            prs.length,
            'username:',
            user,
          );
          const payload = buildBadgePayload(prs, user, st.ui.badgeStyle, st.ui.theme, nc);
          sendToBadge(payload);
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

  // Listen for expand-sidebar events from badge
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
            await invoke('hide_badge');
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

  // Listen for open-pr-detail events from badge
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
}
