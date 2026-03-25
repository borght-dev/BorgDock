import { usePrStore } from '@/stores/pr-store';
import { PullRequestCard } from './PullRequestCard';
import { RepoGroup } from './RepoGroup';

function SkeletonCard() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card-background)] p-2.5 animate-pulse">
      <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-surface-raised)]" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-[var(--color-surface-raised)]" />
        <div className="h-2.5 w-1/2 rounded bg-[var(--color-surface-raised)]" />
        <div className="h-2 w-1/3 rounded bg-[var(--color-surface-raised)]" />
      </div>
    </div>
  );
}

export function PullRequestList() {
  const isPolling = usePrStore((s) => s.isPolling);
  const lastPollTime = usePrStore((s) => s.lastPollTime);

  // Subscribe to the underlying state so this component re-renders
  // when filter/search/sort/data changes. The function-typed selectors
  // (filteredPrs, groupedByRepo) have a stable reference and would
  // never trigger a re-render on their own.
  const pullRequests = usePrStore((s) => s.pullRequests);
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);
  const filter = usePrStore((s) => s.filter);
  const searchQuery = usePrStore((s) => s.searchQuery);
  const sortBy = usePrStore((s) => s.sortBy);
  const username = usePrStore((s) => s.username);

  const groupedByRepo = usePrStore((s) => s.groupedByRepo);
  const filteredPrs = usePrStore((s) => s.filteredPrs);

  // Intentionally reference the subscribed values so the linter
  // doesn't remove them and React doesn't skip re-renders.
  void pullRequests;
  void closedPullRequests;
  void filter;
  void searchQuery;
  void sortBy;
  void username;

  const groups = groupedByRepo();
  const prs = filteredPrs();
  const isFirstLoad = !lastPollTime && isPolling;

  if (isFirstLoad) {
    return (
      <div className="flex flex-col gap-1.5 p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg
          width="32"
          height="32"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--color-text-ghost)"
          strokeWidth="1"
          strokeLinecap="round"
          className="mb-3"
        >
          <path d="M6 3H3v10h10V6" />
          <path d="M10 2v4h4" />
          <path d="m10 2 4 4" />
        </svg>
        <p className="text-xs text-[var(--color-text-muted)]">No pull requests found</p>
      </div>
    );
  }

  // Show recently closed section at the bottom (unless already filtering to closed)
  const showRecentlyClosed = filter !== 'closed' && closedPullRequests.length > 0;

  return (
    <div className="flex flex-col gap-0.5">
      {[...groups.entries()].map(([repoKey, repoPrs]) => (
        <RepoGroup key={repoKey} repoKey={repoKey} prs={repoPrs} />
      ))}

      {showRecentlyClosed && (
        <>
          <div
            className="mt-4 flex items-center gap-2 border-t px-3 pt-2.5 pb-1"
            style={{ borderColor: 'var(--color-separator)' }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-ghost)' }}>
              Recently Closed
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--color-separator)' }} />
            <span className="rounded-full px-1.5 text-[9px] font-medium tabular-nums" style={{ color: 'var(--color-text-ghost)', background: 'var(--color-surface-raised)' }}>
              {closedPullRequests.length}
            </span>
          </div>
          <div className="opacity-60">
            {closedPullRequests.map((pr) => (
              <div key={pr.pullRequest.number} className="px-0.5">
                <PullRequestCard prWithChecks={pr} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
