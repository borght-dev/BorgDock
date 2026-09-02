import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Card } from '@/components/shared/primitives';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { PrCardContainer } from './PrCardContainer';
import { type PrFilterCounts, PrToolbar } from './PrToolbar';
import { RepoGroup } from './RepoGroup';
import { ReviewSlaIndicator } from './ReviewSlaIndicator';
import { TeamReviewLoad } from './TeamReviewLoad';

const VIRTUALIZE_THRESHOLD = 50;

function SkeletonCard() {
  return (
    <Card padding="sm">
      <div className="flex items-start gap-2.5 animate-pulse">
        <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-surface-raised)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-[var(--color-surface-raised)]" />
          <div className="h-2.5 w-1/2 rounded bg-[var(--color-surface-raised)]" />
          <div className="h-2 w-1/3 rounded bg-[var(--color-surface-raised)]" />
        </div>
      </div>
    </Card>
  );
}

export function PrList() {
  const isPolling = usePrStore((s) => s.isPolling);
  const lastPollTime = usePrStore((s) => s.lastPollTime);

  // Subscribe to state fields that affect derived selectors so the
  // component re-renders when they change. useShallow performs a
  // shallow equality check, replacing the old void-statement workaround.
  const { closedPullRequests, filter, username } = usePrStore(
    useShallow((s) => ({
      pullRequests: s.pullRequests,
      closedPullRequests: s.closedPullRequests,
      filter: s.filter,
      searchQuery: s.searchQuery,
      sortBy: s.sortBy,
      username: s.username,
      reviewRequestTimestamps: s.reviewRequestTimestamps,
    })),
  );

  const needsMyReview = usePrStore((s) => s.needsMyReview);
  const groupedPrs = usePrStore((s) => s.groupedPrs);
  const filteredPrs = usePrStore((s) => s.filteredPrs);
  const counts = usePrStore((s) => s.counts);
  const authorLoad = usePrStore((s) => s.authorLoad);
  const groupBy = useUiStore((s) => s.prGroupBy);
  const density = useUiStore((s) => s.prDensity);

  const groups = groupedPrs(groupBy);
  const prs = filteredPrs();
  const reviewQueue = needsMyReview();
  const authors = authorLoad();
  const isFirstLoad = !lastPollTime && isPolling;

  // Map the store's PrFilter-keyed counts onto the PrToolbar's UI-keyed counts.
  // The two key sets diverge by intent: store keys mirror the underlying
  // filter ids (`needsReview`, `reviewing`); toolbar keys are short labels
  // (`needs`, `review`).
  const c = counts();
  const prFilterCounts = useMemo<PrFilterCounts>(
    () => ({
      all: c.all,
      needs: c.needsReview,
      mine: c.mine,
      failing: c.failing,
      ready: c.ready,
      review: c.reviewing,
      closed: c.closed,
    }),
    [c.all, c.needsReview, c.mine, c.failing, c.ready, c.reviewing, c.closed],
  );

  if (isFirstLoad) {
    return (
      <>
        <PrToolbar counts={prFilterCounts} />
        <div className="flex flex-col gap-1.5 p-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </>
    );
  }

  if (prs.length === 0) {
    return (
      <>
        <PrToolbar counts={prFilterCounts} />
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
      </>
    );
  }

  // Show recently closed section at the bottom (unless already filtering to closed)
  const showRecentlyClosed = filter !== 'closed' && closedPullRequests.length > 0;
  // Show "Needs Your Review" pinned section in "All" view when there are items
  const showReviewQueue = filter === 'all' && reviewQueue.length > 0;

  return (
    <div className="flex flex-col gap-0.5">
      <PrToolbar counts={prFilterCounts} />
      {filter !== 'closed' && authors.length > 0 && (
        <div
          className="flex items-center gap-2 overflow-x-auto px-3 py-2"
          aria-label="Pull requests by author"
        >
          {authors.map((author) => (
            <span
              key={author.login.toLowerCase()}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-raised)] px-2 py-1 text-[10px]"
            >
              <span>
                {author.login}
                {author.isMe ? ' (you)' : ''}
              </span>
              <span className="bd-mono">{author.count}</span>
              {author.failing > 0 && (
                <span className="text-[var(--color-status-red)]">{author.failing} failing</span>
              )}
            </span>
          ))}
        </div>
      )}
      {showReviewQueue && (
        <>
          <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-[var(--color-separator)]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-status-yellow)]">
              Needs Your Review
            </span>
            <span className="h-px flex-1 bg-[var(--color-separator)]" />
            {/* style: color-mix background + yellow text — no Tailwind utility for color-mix percentage blends */}
            <span
              className="rounded-full px-1.5 text-[9px] font-medium tabular-nums"
              style={{
                color: 'var(--color-status-yellow)',
                background: 'color-mix(in srgb, var(--color-status-yellow) 15%, transparent)',
              }}
            >
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
                  <PrCardContainer prWithChecks={pr} density={density} />
                </div>
              );
            })}
          </div>
          <div className="mb-1 h-px mx-3 bg-[var(--color-separator)]" />
        </>
      )}

      {groups.map((group) => (
        <RepoGroup key={group.key} group={group} />
      ))}

      {filter !== 'closed' && <TeamReviewLoad />}

      {showRecentlyClosed && (
        <>
          <div className="mt-4 flex items-center gap-2 border-t px-3 pt-2.5 pb-1 border-[var(--color-separator)]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-ghost)]">
              Recently Closed
            </span>
            <span className="h-px flex-1 bg-[var(--color-separator)]" />
            <span className="rounded-full px-1.5 text-[9px] font-medium tabular-nums text-[var(--color-text-ghost)] bg-[var(--color-surface-raised)]">
              {closedPullRequests.length}
            </span>
          </div>
          <div className="opacity-60">
            {closedPullRequests.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualizedPrCards prs={closedPullRequests} />
            ) : (
              closedPullRequests.map((pr) => (
                <div key={pr.pullRequest.number} className="px-0.5">
                  <PrCardContainer prWithChecks={pr} />
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
      {/* style: virtualizer total height is computed per render — cannot be expressed as a Tailwind class */}
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const pr = prs[virtualRow.index]!;
          return (
            <div
              key={pr.pullRequest.number}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              // style: virtualizer absolute positioning + translateY offset computed per row
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="px-0.5">
                <PrCardContainer prWithChecks={pr} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
