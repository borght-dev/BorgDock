import { useVirtualizer } from '@tanstack/react-virtual';
import { GitPullRequest } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { groupWorkbenchPrs, NEEDS_YOU_GROUP_KEY, type PrGroupBy } from '@/services/pr-grouping';
import { matchesSearch } from '@/services/pr-search';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';
import {
  matchesPrFilter,
  myReviewRequestedAt,
  type PrFilter,
  type SortBy,
  usePrStore,
} from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { EASE_OUT, flip, motionMs, motionOK } from '@/utils/motion';
import { type WorkbenchFilter, workbenchFilterCounts, workbenchFilterFor } from './PrFilterControl';
import { WorkbenchPrHead } from './PrToolbar';
import { prRowKey } from './pr-card-data';
import { groupFlipKey, WorkbenchGroup, WorkbenchPrGroup } from './RepoGroup';
import { ReviewSlaIndicator } from './ReviewSlaIndicator';
import { ReviewerRow, useTeamReviewers } from './TeamReviewLoad';
import { WorkbenchPrRow } from './WorkbenchPrRow';

/** Recently closed switches to a virtualized list above this many PRs. */
export const VIRTUALIZE_THRESHOLD = 50;

/** Rows `flip()` follows: every keyed row, i.e. every row a virtualizer does not recycle. */
export const FLIP_ROW_SELECTOR = '[data-key]';

const ROW_HEIGHT: Record<PrDensity, number> = { comfortable: 42, compact: 32 };

const MINUTE = 60 * 1000;

/** Now, to the minute: rows only re-render for their "updated … ago" once a minute. */
function minuteNow(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5'];

function SkeletonRows() {
  return (
    <div className="bd-wb-skeleton" aria-hidden="true">
      {SKELETON_ROWS.map((id) => (
        <div key={id} className="bd-wb-skeleton__row">
          <span className="bd-wb-skeleton__avatar" />
          <span className="bd-wb-skeleton__line" />
        </div>
      ))}
    </div>
  );
}

/**
 * The oldest review request waiting on me, for the "Needs you" heading. Uses
 * the same lookup as `needsMyReview` (direct request, else team request), and
 * does not pulse: nothing in the Workbench list animates on its own.
 */
function OldestRequest({ pr, username }: { pr: PullRequestWithChecks; username: string }) {
  const timestamps = usePrStore((s) => s.reviewRequestTimestamps);
  const requestedAt = myReviewRequestedAt(pr, username, timestamps);
  const tier = getReviewSlaTier(requestedAt);
  return (
    <span className="bd-wb-group__aside" data-review-sla={tier}>
      <ReviewSlaIndicator tier={tier} waitTime={formatReviewWaitTime(requestedAt)} still />
    </span>
  );
}

/**
 * Recently closed above `VIRTUALIZE_THRESHOLD` rows. The virtualizer
 * recycles rows, so they carry no `data-key` and `flip()` leaves them
 * alone; the block crossfades instead (`data-crossfade`).
 */
function VirtualizedClosedRows({
  prs,
  density,
  now,
}: {
  prs: PullRequestWithChecks[];
  density: PrDensity;
  now: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: prs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT[density],
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="bd-wb-virtual" data-virtual="" data-crossfade="">
      {/* style: virtualizer total height is computed per render */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const pr = prs[item.index]!;
          return (
            <div
              key={prRowKey(pr.pullRequest)}
              data-index={item.index}
              className="bd-wb-virtual__item"
              // style: virtualizer offset computed per row
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <WorkbenchPrRow prWithChecks={pr} density={density} now={now} animateKey={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * WorkbenchPrList — the pull request list of the Workbench layout
 * (`ui.layoutV3`; plans/ui-overhaul-workbench.md, phase 2).
 *
 * - Head row: title, All / Needs you / Mine / Failing, search, and the
 *   "Group and sort" menu.
 * - Groups: "Needs you" first when the filter is All, then the rest by
 *   `prGroupBy`; each PR appears once. Review load and Recently closed
 *   follow with the same heading style.
 * - Filter, group and sort changes FLIP the rows (`flip()` from
 *   utils/motion): rows that leave fade out first, survivors glide to their
 *   new slot, new rows fade in. A virtualized Recently closed list only
 *   crossfades.
 */
export function WorkbenchPrList() {
  const isPolling = usePrStore((s) => s.isPolling);
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const {
    closedPullRequests: allClosed,
    filter,
    searchQuery,
    username,
    teams,
  } = usePrStore(
    useShallow((s) => ({
      pullRequests: s.pullRequests,
      closedPullRequests: s.closedPullRequests,
      filter: s.filter,
      searchQuery: s.searchQuery,
      sortBy: s.sortBy,
      username: s.username,
      teams: s.teams,
      reviewRequestTimestamps: s.reviewRequestTimestamps,
    })),
  );
  const filteredPrs = usePrStore((s) => s.filteredPrs);
  const counts = usePrStore((s) => s.counts);
  const needsMyReview = usePrStore((s) => s.needsMyReview);
  const groupBy = useUiStore((s) => s.prGroupBy);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
  const reviewers = useTeamReviewers();

  const listRef = useRef<HTMLDivElement>(null);
  // The segment the user just picked: the control shows it at once while the
  // leaving rows fade, before the store changes.
  const [requestedFilter, setRequestedFilter] = useState<PrFilter | null>(null);
  const changeToken = useRef(0);
  useEffect(
    () => () => {
      changeToken.current++;
    },
    [],
  );

  const prs = filteredPrs();
  const groups = useMemo(
    () => groupWorkbenchPrs(prs, groupBy, username, teams, filter === 'all'),
    [prs, groupBy, username, teams, filter],
  );
  const closed = useMemo(
    () => allClosed.filter((pr) => matchesSearch(pr, searchQuery)),
    [allClosed, searchQuery],
  );
  const oldestRequest = needsMyReview().find((pr) => matchesSearch(pr, searchQuery));
  const filterCounts = workbenchFilterCounts(counts());
  const now = minuteNow();

  /** Runs a list change through FLIP; a newer change makes an older pending one a no-op. */
  const animateChange = useCallback((mutate: () => void, leaving: string[] = []) => {
    const token = ++changeToken.current;
    const container = listRef.current;
    void flip(
      container,
      () => {
        if (token !== changeToken.current) return;
        flushSync(mutate);
      },
      FLIP_ROW_SELECTOR,
      { leaving },
    ).then(() => {
      if (token !== changeToken.current || !container || !motionOK()) return;
      for (const block of container.querySelectorAll<HTMLElement>('[data-crossfade]')) {
        if (typeof block.animate !== 'function') continue;
        block.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: motionMs('--motion-base', 260),
          easing: EASE_OUT,
        });
      }
    });
  }, []);

  /**
   * A filter change through FLIP. `search`, when given, replaces the search
   * in the same change (the Review load rows filter by a reviewer).
   */
  const handleFilterChange = useCallback(
    (next: WorkbenchFilter, search?: string) => {
      const state = usePrStore.getState();
      const { username, teams } = state;
      const nextSearch = search ?? state.searchQuery;
      const current = state.filteredPrs();
      const leavingRows = current
        .filter(
          (pr) => !matchesPrFilter(pr, next, username, teams) || !matchesSearch(pr, nextSearch),
        )
        .map((pr) => prRowKey(pr.pullRequest));
      // Group headings that have no rows under the new filter fade with them.
      const groupBy = useUiStore.getState().prGroupBy;
      const nextPrs = state.pullRequests.filter(
        (pr) => matchesSearch(pr, nextSearch) && matchesPrFilter(pr, next, username, teams),
      );
      const nextGroups = new Set(
        groupWorkbenchPrs(nextPrs, groupBy, username, teams, next === 'all').map((g) => g.key),
      );
      const leavingGroups = groupWorkbenchPrs(
        current,
        groupBy,
        username,
        teams,
        state.filter === 'all',
      )
        .filter((g) => !nextGroups.has(g.key))
        .map((g) => groupFlipKey(g.key));
      setRequestedFilter(next);
      animateChange(() => {
        const store = usePrStore.getState();
        store.setFilter(next);
        if (search !== undefined) store.setSearchQuery(search);
        setRequestedFilter(null);
      }, [...leavingRows, ...leavingGroups]);
    },
    [animateChange],
  );

  // The control offers four filters. One left over from the tab layout (or
  // set elsewhere) maps onto them, in the store, so the highlight, the rows
  // and FLIP all agree: "Needs review" becomes "Needs you", the rest "All".
  useLayoutEffect(() => {
    if (workbenchFilterFor(filter) !== null) return;
    usePrStore.getState().setFilter(filter === 'needsReview' ? 'needsYou' : 'all');
  }, [filter]);

  const handleGroupByChange = useCallback(
    (next: PrGroupBy) => animateChange(() => useUiStore.getState().setPrGroupBy(next)),
    [animateChange],
  );

  const handleSortChange = useCallback(
    (next: SortBy) => animateChange(() => usePrStore.getState().setSortBy(next)),
    [animateChange],
  );

  const head = (
    <WorkbenchPrHead
      filter={requestedFilter ?? filter}
      counts={filterCounts}
      onFilterChange={handleFilterChange}
      onGroupByChange={handleGroupByChange}
      onSortChange={handleSortChange}
    />
  );

  if (!lastPollTime && isPolling) {
    return (
      <div className="bd-wb-prs">
        {head}
        <SkeletonRows />
      </div>
    );
  }

  const showClosed = filter !== 'closed' && closed.length > 0;
  const showReviewLoad = filter !== 'closed' && reviewers.length > 0;

  return (
    <div className="bd-wb-prs">
      {head}
      <div ref={listRef} className="bd-wb-list" data-density={density}>
        {prs.length === 0 && (
          <div className="bd-wb-empty">
            <GitPullRequest size={28} strokeWidth={1.5} aria-hidden="true" />
            <p>
              {filter === 'all' && !searchQuery
                ? 'No open pull requests'
                : 'No pull requests match this filter'}
            </p>
          </div>
        )}

        {groups.map((group) => (
          <WorkbenchPrGroup
            key={group.key}
            group={group}
            density={density}
            now={now}
            aside={
              group.key === NEEDS_YOU_GROUP_KEY && oldestRequest ? (
                <OldestRequest pr={oldestRequest} username={username} />
              ) : undefined
            }
          />
        ))}

        {showReviewLoad && (
          <WorkbenchGroup groupKey="review-load" label="Review load" count={reviewers.length}>
            <div className="bd-wb-review-load">
              {reviewers.map((r) => (
                <ReviewerRow
                  key={r.login}
                  reviewer={r}
                  onSelect={(reviewer) => handleFilterChange('needsYou', reviewer.login)}
                />
              ))}
            </div>
          </WorkbenchGroup>
        )}

        {showClosed && (
          <WorkbenchGroup groupKey="recently-closed" label="Recently closed" count={closed.length}>
            <div className="bd-wb-closed">
              {closed.length > VIRTUALIZE_THRESHOLD ? (
                <VirtualizedClosedRows prs={closed} density={density} now={now} />
              ) : (
                closed.map((pr) => (
                  <WorkbenchPrRow
                    key={prRowKey(pr.pullRequest)}
                    prWithChecks={pr}
                    density={density}
                    now={now}
                  />
                ))
              )}
            </div>
          </WorkbenchGroup>
        )}
      </div>
    </div>
  );
}
