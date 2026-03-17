import { useEffect } from 'react';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import type { BadgePrItem, StatusColor } from '@/components/badge/FloatingBadge';

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

export function useBadgeSync() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const badgeStyle = useSettingsStore((s) => s.settings.ui.badgeStyle);
  const theme = useSettingsStore((s) => s.settings.ui.theme);

  // Emit badge data whenever PRs, username, badge style, or theme change
  useEffect(() => {
    const payload = buildBadgePayload(pullRequests, username, badgeStyle, theme);
    sendToBadge(payload);
  }, [pullRequests, username, badgeStyle, theme]);

  // Respond to badge-request-data: re-send current payload
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('badge-request-data', () => {
          const prs = usePrStore.getState().pullRequests;
          const user = usePrStore.getState().username;
          const st = useSettingsStore.getState().settings;
          console.log('[BadgeSync] Received badge-request-data, PRs in store:', prs.length, 'username:', user);
          const payload = buildBadgePayload(prs, user, st.ui.badgeStyle, st.ui.theme);
          sendToBadge(payload);
        });
      } catch {
        // ignore
      }
    })();
    return () => unlisten?.();
  }, []);

  // Listen for expand-sidebar events from badge
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('expand-sidebar', async () => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('toggle_sidebar');
            await invoke('hide_badge');
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    })();
    return () => unlisten?.();
  }, []);

  // Listen for open-pr-detail events from badge
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ number: number }>('open-pr-detail', (event) => {
          useUiStore.getState().selectPr(event.payload.number);
          useUiStore.getState().setSidebarVisible(true);
        });
      } catch {
        // ignore
      }
    })();
    return () => unlisten?.();
  }, []);
}
