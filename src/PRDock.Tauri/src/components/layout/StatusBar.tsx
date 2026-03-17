import { usePrStore } from '@/stores/pr-store';

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function StatusBar() {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const rateLimit = usePrStore((s) => s.rateLimit);
  const lastPollTime = usePrStore((s) => s.lastPollTime);

  const openCount = pullRequests.length;

  return (
    <div className="flex items-center justify-between px-3 py-1 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-status-bar-bg)] backdrop-blur-sm border-t border-[var(--color-separator)]"
      style={{ height: 28 }}
    >
      <span>
        {openCount} open PR{openCount !== 1 ? 's' : ''}
      </span>

      {rateLimit && (
        <span>
          API: {rateLimit.remaining}/{rateLimit.limit}
        </span>
      )}

      <span>Updated {formatTimeAgo(lastPollTime)}</span>
    </div>
  );
}
