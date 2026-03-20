import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type BadgeStyleProps, badgeStyleMap } from './BadgeStyles';
import type { BadgePrItem, StatusColor } from './FloatingBadge';

interface BadgeData {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  notificationCount: number;
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
    notificationCount: 0,
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
      await invoke('resize_badge', { width: 540, height: 80 });
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

  const [isExpanded, setIsExpanded] = useState(false);
  const [expandDirection, setExpandDirection] = useState<'up' | 'down'>('down');

  const toggleExpanded = useCallback(async () => {
    const next = !isExpanded;
    setIsExpanded(next);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (next) {
        // Expanding: let the backend auto-detect direction
        const size = { width: 900, height: 500 };
        const dir = await invoke<string>('resize_badge', {
          width: size.width,
          height: size.height,
          anchor: 'auto',
        });
        setExpandDirection(dir === 'up' ? 'up' : 'down');
      } else {
        // Collapsing: anchor the edge where the pill is so it doesn't jump
        const size = { width: 540, height: 80 };
        const anchor = expandDirection === 'up' ? 'bottom' : 'top';
        await invoke('resize_badge', { width: size.width, height: size.height, anchor });
      }
    } catch {
      /* ignore */
    }
  }, [isExpanded, expandDirection]);

  const statusColor = determineStatusColor(data.failingCount, data.pendingCount);
  const statusText = formatStatusText(data.failingCount, data.pendingCount);

  const BadgeStyleComponent = useMemo<React.ComponentType<BadgeStyleProps>>(() => {
    const match = data.badgeStyle ? badgeStyleMap[data.badgeStyle] : undefined;
    const fallback = badgeStyleMap.GlassCapsule!;
    return match ?? fallback;
  }, [data.badgeStyle]);

  const STATUS_DOT_MAP: Record<StatusColor, string> = {
    green: 'var(--color-status-green)',
    red: 'var(--color-status-red)',
    yellow: 'var(--color-status-yellow)',
  };

  const expandUp = isExpanded && expandDirection === 'up';

  const prPanel = isExpanded && (
    <div
      className={clsx(
        'w-[880px] rounded-xl bg-[var(--color-badge-surface)] border border-[var(--color-badge-border)]',
        'shadow-lg overflow-hidden',
        expandUp ? 'mb-1' : 'mt-1',
      )}
    >
      <div className="grid grid-cols-2 divide-x divide-[var(--color-separator)]">
        <PrColumn
          title="MY PRS"
          items={data.myPrs}
          statusDotMap={STATUS_DOT_MAP}
          onOpenPr={handleOpenPr}
        />
        <PrColumn
          title="TEAM"
          items={data.teamPrs}
          statusDotMap={STATUS_DOT_MAP}
          onOpenPr={handleOpenPr}
        />
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-[var(--color-separator)] px-3 py-2">
        <span className="text-xs text-[var(--color-text-muted)]">{data.totalPrCount} total</span>
        {data.failingCount > 0 && (
          <span className="text-xs text-[var(--color-status-red)]">
            {data.failingCount} failing
          </span>
        )}
        {data.pendingCount > 0 && (
          <span className="text-xs text-[var(--color-status-yellow)]">
            {data.pendingCount} pending
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={clsx(
        'flex h-screen w-screen justify-center',
        expandUp ? 'items-end pb-1' : 'items-start pt-1',
      )}
      style={{ background: 'transparent' }}
    >
      <div className="flex flex-col items-center">
        {expandUp && prPanel}
        <div className="relative">
          <BadgeStyleComponent
            totalPrCount={data.totalPrCount}
            failingCount={data.failingCount}
            pendingCount={data.pendingCount}
            statusColor={statusColor}
            statusText={statusText}
            onClick={handleExpandSidebar}
            onToggleExpand={toggleExpanded}
            isExpanded={isExpanded}
          />
          {data.notificationCount > 0 && (
            <div
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white shadow-md animate-[notifPop_0.3s_ease-out]"
              style={{
                backgroundColor: 'var(--color-status-red)',
                minWidth: 18,
                height: 18,
                padding: '0 4px',
                boxShadow: '0 0 6px var(--color-badge-glow-red)',
              }}
            >
              {data.notificationCount}
            </div>
          )}
        </div>
        {!expandUp && prPanel}
      </div>
    </div>
  );
}

function PrColumn({
  title,
  items,
  statusDotMap,
  onOpenPr,
}: {
  title: string;
  items: BadgePrItem[];
  statusDotMap: Record<StatusColor, string>;
  onOpenPr: (item: BadgePrItem) => void;
}) {
  return (
    <div className="px-2.5 py-2.5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-ghost)]">
        {title}
      </div>
      <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
        {items.map((item) => (
          <button
            key={`${item.repoOwner}/${item.repoName}#${item.number}`}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
            onClick={() => onOpenPr(item)}
          >
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: statusDotMap[item.statusColor] }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--color-text-primary)] leading-snug">
                {item.title}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                #{item.number} {item.timeAgo}
              </div>
            </div>
            {item.checksText && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)]">
                {item.checksText}
              </span>
            )}
          </button>
        ))}
        {items.length === 0 && (
          <div className="py-3 text-center text-xs text-[var(--color-text-ghost)]">None</div>
        )}
      </div>
    </div>
  );
}
