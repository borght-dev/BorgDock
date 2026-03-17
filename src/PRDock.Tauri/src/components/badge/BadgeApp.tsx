import { useState, useEffect, useCallback } from 'react';
import { FloatingBadge, type StatusColor, type BadgePrItem } from './FloatingBadge';

interface BadgeData {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  myPrs: BadgePrItem[];
  teamPrs: BadgePrItem[];
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

export function BadgeApp() {
  const [data, setData] = useState<BadgeData>({
    totalPrCount: 0,
    failingCount: 0,
    pendingCount: 0,
    myPrs: [],
    teamPrs: [],
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setup() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<BadgeData>('badge-update', (event) => {
          setData(event.payload);
        });
      } catch (err) {
        console.error('Failed to listen for badge updates:', err);
      }
    }

    setup();
    return () => unlisten?.();
  }, []);

  const handleExpandSidebar = useCallback(async () => {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('expand-sidebar');
    } catch (err) {
      console.error('Failed to emit expand-sidebar:', err);
    }
  }, []);

  const handleOpenPr = useCallback(async (item: BadgePrItem) => {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('open-pr-detail', {
        number: item.number,
        repoOwner: item.repoOwner,
        repoName: item.repoName,
      });
    } catch (err) {
      console.error('Failed to emit open-pr-detail:', err);
    }
  }, []);

  const statusColor = determineStatusColor(data.failingCount, data.pendingCount);
  const statusText = formatStatusText(data.failingCount, data.pendingCount);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
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
    </div>
  );
}
