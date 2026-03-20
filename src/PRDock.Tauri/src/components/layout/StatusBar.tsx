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
      className="flex shrink-0 items-center justify-between border-t border-[var(--color-separator)] px-2.5"
      style={{
        height: 26,
        fontFamily: 'var(--font-code)',
        fontSize: 10,
        background: 'var(--color-card-background)',
      }}
    >
      <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
        <span className="font-medium">{counts.all} PRs</span>
        {counts.failing > 0 && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-status-red)' }}
            />
            <span style={{ color: 'var(--color-status-red)' }}>
              {counts.failing} failing
            </span>
          </span>
        )}
        {counts.ready > 0 && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-status-green)' }}
            />
            <span style={{ color: 'var(--color-status-green)' }}>
              {counts.ready} ready
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[var(--color-text-ghost)]">
        {rateLimit && (
          <span
            className="tabular-nums"
            title={`GitHub API: ${rateLimit.remaining} of ${rateLimit.limit} remaining`}
          >
            {rateLimit.remaining}/{rateLimit.limit}
          </span>
        )}
        <span className="inline-block h-0.5 w-0.5 rounded-full bg-[var(--color-text-ghost)]" />
        <span>{formatTimeAgo(lastPollTime)}</span>
      </div>
    </div>
  );
}
