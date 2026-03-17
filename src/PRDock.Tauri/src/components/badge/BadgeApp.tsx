import { useState, useEffect, useCallback, useMemo } from 'react';
import { FloatingBadge, type StatusColor, type BadgePrItem } from './FloatingBadge';
import { badgeStyleMap, type BadgeStyleProps } from './BadgeStyles';

interface BadgeData {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  myPrs: BadgePrItem[];
  teamPrs: BadgePrItem[];
  badgeStyle?: string;
  theme?: string;
}

function determineStatusColor(failing: number, pending: number): StatusColor {
  if (failing > 0) return 'red';
  if (pending > 0) return 'yellow';
  return 'green';
}

function formatStatusText(failing: number, pending: number): string {
  if (failing === 0 && pending === 0) return 'all clear';
  const parts: string[] = [];
  if (failing > 0) parts.push(`${failing} failing`);
  if (pending > 0) parts.push(`${pending} in progress`);
  return parts.join(', ');
}

function applyBadgeTheme(theme: string) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function BadgeApp() {
  const [data, setData] = useState<BadgeData>({
    totalPrCount: 0,
    failingCount: 0,
    pendingCount: 0,
    myPrs: [],
    teamPrs: [],
  });

  // Listen for badge-update events from the main window
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        console.log('[Badge] Setting up badge-update listener...');
        const { listen, emit } = await import('@tauri-apps/api/event');
        unlisten = await listen<BadgeData>('badge-update', (event) => {
          console.log('[Badge] Received badge-update:', JSON.stringify(event.payload));
          setData(event.payload);
          if (event.payload.theme) {
            applyBadgeTheme(event.payload.theme);
          }
        });
        console.log('[Badge] Listener registered, requesting fresh data...');
        await emit('badge-request-data', {});
        console.log('[Badge] badge-request-data emitted');
      } catch (err) {
        console.error('[Badge] Failed to listen for badge updates:', err);
      }
    })();

    return () => unlisten?.();
  }, []);

  const handleExpandSidebar = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Reset badge window to collapsed size before hiding
      await invoke('resize_badge', { width: 260, height: 50 });
      // Show the main sidebar and hide the badge window directly
      await invoke('toggle_sidebar');
      await invoke('hide_badge');
    } catch (err) {
      console.error('Failed to expand sidebar:', err);
    }
  }, []);

  const handleOpenPr = useCallback(async (item: BadgePrItem) => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');
      await emitTo('main', 'open-pr-detail', {
        number: item.number,
        repoOwner: item.repoOwner,
        repoName: item.repoName,
      });
      await invoke('toggle_sidebar');
      await invoke('hide_badge');
    } catch (err) {
      console.error('Failed to open PR:', err);
    }
  }, []);

  const statusColor = determineStatusColor(data.failingCount, data.pendingCount);
  const statusText = formatStatusText(data.failingCount, data.pendingCount);

  const BadgeStyleComponent = useMemo<React.ComponentType<BadgeStyleProps> | null>(() => {
    if (!data.badgeStyle) return null;
    return badgeStyleMap[data.badgeStyle] ?? null;
  }, [data.badgeStyle]);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      style={{ background: 'transparent' }}
    >
      {BadgeStyleComponent ? (
        <BadgeStyleComponent
          totalPrCount={data.totalPrCount}
          failingCount={data.failingCount}
          pendingCount={data.pendingCount}
          statusColor={statusColor}
          statusText={statusText}
          onClick={handleExpandSidebar}
        />
      ) : (
        <FloatingBadge
          totalPrCount={data.totalPrCount}
          failingCount={data.failingCount}
          pendingCount={data.pendingCount}
          statusColor={statusColor}
          statusText={statusText}
          onExpandSidebar={handleExpandSidebar}
          myPrs={data.myPrs}
          teamPrs={data.teamPrs}
          onOpenPr={handleOpenPr}
        />
      )}
    </div>
  );
}
