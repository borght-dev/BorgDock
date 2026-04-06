import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import { PullRequestCard } from './PullRequestCard';
import { RepoGroup } from './RepoGroup';
import { ReviewSlaIndicator } from './ReviewSlaIndicator';
import { TeamReviewLoad } from './TeamReviewLoad';

const VIRTUALIZE_THRESHOLD = 50;

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

  const needsMyReview = usePrStore((s) => s.needsMyReview);
  const reviewRequestTimestamps = usePrStore((s) => s.reviewRequestTimestamps);
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
  void reviewRequestTimestamps;

  const groups = groupedByRepo();
  const prs = filteredPrs();
  const reviewQueue = needsMyReview();
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
  // Show "Needs Your Review" pinned section in "All" view when there are items
  const showReviewQueue = filter === 'all' && reviewQueue.length > 0;

  return (
    <div className="flex flex-col gap-0.5">
      {showReviewQueue && (
        <>
          <div
            className="flex items-center gap-2 px-3 pt-2 pb-1"
            style={{ borderColor: 'var(--color-separator)' }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-status-yellow)' }}>
              Needs Your Review
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--color-separator)' }} />
            <span className="rounded-full px-1.5 text-[9px] font-medium tabular-nums" style={{ color: 'var(--color-status-yellow)', background: 'color-mix(in srgb, var(--color-status-yellow) 15%, transparent)' }}>
              {reviewQueue.length}
            </span>
          </div>
          <div className="flex flex-col gap-1 pb-1">
            {reviewQueue.map((pr) => {
              const prk = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`;
              const requestedAt = usePrStore.getState().getReviewRequestedAt(prk, username);
              const tier = requestedAt ? getReviewSlaTier(requestedAt) : 'fresh';
              const waitTime = requestedAt ? formatReviewWaitTime(requestedAt) : '<1h';
              return (
                <div key={`review-${pr.pullRequest.number}`} className="relative">
                  <div className="absolute right-3 top-3 z-10">
                    <ReviewSlaIndicator tier={tier} waitTime={waitTime} />
                  </div>
                  <PullRequestCard prWithChecks={pr} />
                </div>
              );
            })}
          </div>
          <div className="mb-1 h-px mx-3" style={{ background: 'var(--color-separator)' }} />
        </>
      )}

      {[...groups.entries()].map(([repoKey, repoPrs]) => (
        <RepoGroup key={repoKey} repoKey={repoKey} prs={repoPrs} />
      ))}

      {filter !== 'closed' && <TeamReviewLoad />}

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
            {closedPullRequests.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualizedPrCards prs={closedPullRequests} />
            ) : (
              closedPullRequests.map((pr) => (
                <div key={pr.pullRequest.number} className="px-0.5">
                  <PullRequestCard prWithChecks={pr} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function VirtualizedPrCards({ prs }: { prs: PullRequestWithChecks[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: prs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="max-h-[400px] overflow-y-auto">
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const pr = prs[virtualRow.index];
          return (
            <div
              key={pr.pullRequest.number}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="px-0.5">
                <PullRequestCard prWithChecks={pr} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
