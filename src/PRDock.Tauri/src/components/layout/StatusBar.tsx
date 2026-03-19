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
  const getCounts = usePrStore((s) => s.counts);

  // Subscribe to deps so counts re-evaluates
  const username = usePrStore((s) => s.username);
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);
  void username;
  void closedPullRequests;
  void pullRequests;

  const counts = getCounts();

  return (
    <div
      className="flex items-center justify-between px-3 py-1 text-[10px] bg-[var(--color-status-bar-bg)] backdrop-blur-sm border-t border-[var(--color-separator)]"
      style={{ height: 28, fontFamily: 'var(--font-code)' }}
    >
      <div className="flex items-center gap-1.5 text-[var(--color-text-ghost)]">
        <span>{counts.all} PRs</span>
        {counts.failing > 0 && (
          <>
            <span style={{ color: 'var(--color-status-red)' }}>
              {'\u25CF'} {counts.failing} failing
            </span>
          </>
        )}
        {counts.ready > 0 && (
          <span style={{ color: 'var(--color-status-green)' }}>
            {'\u25CF'} {counts.ready} ready
          </span>
        )}
      </div>

      <span className="text-[var(--color-text-ghost)]">
        {rateLimit && (
          <span className="mr-2">
            {rateLimit.remaining}/{rateLimit.limit}
          </span>
        )}
        {formatTimeAgo(lastPollTime)}
      </span>
    </div>
  );
}
