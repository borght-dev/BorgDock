import { EyeOff, GitPullRequest, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CiFailureStrip } from '@/components/ci-failures/CiFailureStrip';
import { readPrListModel, usePrListModel } from '@/hooks/usePrListModel';
import { staleAfterDaysOf } from '@/services/focus-bucket';
import {
  type PrDisplay,
  type PrSortBy,
  tableTemplate,
  visibleColumns,
} from '@/services/pr-list/display';
import { hasTerms } from '@/services/pr-list/facets';
import { YOUR_TURN_GROUP_KEY } from '@/services/pr-list/groups';
import { buildFacts, inView } from '@/services/pr-list/model';
import { holdChange, releaseChange, settleChange } from '@/services/pr-list/pending-change';
import { clearTerms } from '@/services/pr-list/query';
import { matchesSearch } from '@/services/pr-search';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';
import { myReviewRequestedAt, usePrStore } from '@/stores/pr-store';
import { useActiveSavedView, usePrViewStore } from '@/stores/pr-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { EASE_OUT, FLIP_MAX_ROWS, flip, motionMs, motionOK } from '@/utils/motion';
import { minuteNow } from '@/utils/relative-time';
import { DependencyStrip } from './DependencyUpdates';
import { PrBoard } from './PrBoard';
import { DisplayButton, GroupButton, SortButton, sortPatch } from './PrDisplayMenu';
import { AddFilterButton, FilterChips } from './PrFilterMenu';
import {
  groupFlipKey,
  PrGroupSection,
  PrRows,
  PrTableHead,
  type RowSetup,
  WorkbenchGroup,
} from './PrGroups';
import { PrListHead } from './PrToolbar';
import { type PrViewChoice, PrViewTabs } from './PrViewTabs';
import { ReviewSessionProgress } from './ReviewSessionProgress';
import { ReviewSlaIndicator } from './ReviewSlaIndicator';
import { ReviewerRow, useTeamReviewers } from './TeamReviewLoad';

/**
 * Rows `flip()` follows: every keyed row, i.e. every row a virtualizer does
 * not recycle. Above `FLIP_MAX_ROWS` of them a change skips FLIP.
 */
export const FLIP_ROW_SELECTOR = '[data-key]';

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
 * The oldest review request waiting on me, for the "Your turn" heading. Uses
 * the same lookup as `needsMyReview` (direct request, else team request).
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

/** Keys of the rows and group headings a list of groups puts on screen. */
function flipKeys(model: ReturnType<typeof readPrListModel>): Set<string> {
  const keys = new Set<string>();
  for (const group of model.groups) {
    keys.add(groupFlipKey(group.key));
    for (const sub of group.subgroups) keys.add(groupFlipKey(sub.key));
  }
  for (const f of model.rows) keys.add(f.key);
  return keys;
}

/**
 * PrList — the Pull requests section.
 *
 * - Head: title and search (free text and `field:value` qualifiers).
 * - View tabs: All, Your turn, Mine, Failing, Ready to merge, Stale, then
 *   the saved views and "+ View".
 * - View bar: the query's qualifiers as chips, "+ Filter", and Group, Sort
 *   and Display.
 * - One line each for the shared CI failures and the dependency updates.
 * - The PRs as a table (sortable column headings), a list, or a board, in
 *   the display's groups (`services/pr-list/model.ts` builds them); Review
 *   load and Recently closed follow in list and table.
 * - Filter, group and sort changes FLIP the rows (`flip()` from
 *   utils/motion): rows that leave fade out first, survivors glide to their
 *   new slot, new rows fade in. A long or virtualized list only crossfades.
 */
export function PrList() {
  const hasData = usePrStore((s) => s.pullRequests.length > 0);
  const isPolling = usePrStore((s) => s.isPolling);
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const allClosed = usePrStore((s) => s.closedPullRequests);
  const filter = usePrStore((s) => s.filter);
  const searchQuery = usePrStore((s) => s.searchQuery);
  const username = usePrStore((s) => s.username);
  const teams = usePrStore((s) => s.teams);
  const hideFailing = usePrStore((s) => s.hideFailing);
  const relatedFailure = usePrStore((s) => s.relatedFailure);
  const needsMyReview = usePrStore((s) => s.needsMyReview());
  const display = usePrViewStore((s) => s.display);
  const activeViewId = usePrViewStore((s) => s.activeViewId);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
  const staleSetting = useSettingsStore((s) => s.settings.ui?.staleAfterDays);
  const { edited } = useActiveSavedView();
  const reviewers = useTeamReviewers();
  const now = minuteNow();
  const model = usePrListModel(now);

  const listRef = useRef<HTMLDivElement>(null);
  // The tab just picked: the tabs show it at once while the leaving rows fade.
  const [pending, setPending] = useState<PrViewChoice | null>(null);
  const changeToken = useRef(0);
  useEffect(
    () => () => {
      changeToken.current++;
    },
    [],
  );

  const parsed = model.parsed;
  const closedFacts = useMemo(
    () =>
      buildFacts({
        prs: allClosed.filter((pr) => matchesSearch(pr, parsed.text)),
        username,
        teams,
        now,
        staleAfterDays: staleAfterDaysOf(staleSetting),
        ciOf: () => null,
      }),
    [allClosed, parsed.text, username, teams, now, staleSetting],
  );
  const oldestRequest = needsMyReview.find((pr) => model.rows.some((f) => f.pr === pr));

  /**
   * Runs a list change through FLIP. The change waits for the leaving rows
   * to fade (`holdChange`); a newer change, or saving a view, applies it
   * first (`settleChange`), so quick changes add up. A list of more than
   * `FLIP_MAX_ROWS` rows, a virtualized group or the board skips FLIP (no
   * measuring, no leave fade, no `flushSync`): it changes at once and
   * crossfades as one block.
   */
  const animateChange = useCallback((mutate: () => void, leaving: string[] = []) => {
    settleChange();
    const token = ++changeToken.current;
    const container = listRef.current;
    if (
      container &&
      (container.querySelector(
        '.bd-wb-group:not([data-group-key="recently-closed"]) [data-virtual-prs]',
      ) ||
        container.querySelector('[data-board]') ||
        container.querySelectorAll(FLIP_ROW_SELECTOR).length > FLIP_MAX_ROWS)
    ) {
      mutate();
      if (motionOK() && typeof container.animate === 'function') {
        container.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: motionMs('--motion-base', 200),
          easing: EASE_OUT,
        });
      }
      return;
    }
    const apply = () => {
      changeToken.current++;
      flushSync(mutate);
    };
    holdChange(apply);
    void flip(
      container,
      () => {
        if (token !== changeToken.current) return;
        releaseChange(apply);
        flushSync(mutate);
      },
      FLIP_ROW_SELECTOR,
      { leaving },
    ).then(() => {
      if (token !== changeToken.current || !container || !motionOK()) return;
      for (const block of container.querySelectorAll<HTMLElement>('[data-crossfade]')) {
        if (typeof block.animate !== 'function') continue;
        block.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: motionMs('--motion-base', 200),
          easing: EASE_OUT,
        });
      }
    });
  }, []);

  /** The keys on screen now that the change takes away. */
  const leavingFor = useCallback((overrides: Parameters<typeof readPrListModel>[0]) => {
    const before = flipKeys(readPrListModel());
    const after = flipKeys(readPrListModel(overrides));
    return [...before].filter((key) => !after.has(key));
  }, []);

  const handlePick = useCallback(
    (choice: PrViewChoice) => {
      settleChange();
      const views = usePrViewStore.getState();
      let overrides: Parameters<typeof readPrListModel>[0];
      if (choice.kind === 'saved') {
        const view = views.savedViews.find((v) => v.id === choice.id);
        if (!view) return;
        overrides = { view: view.filter, query: view.query, display: view.display };
      } else {
        overrides = views.activeViewId
          ? { view: choice.key, query: '', display: views.baseDisplay }
          : { view: choice.key };
      }
      setPending(choice);
      animateChange(() => {
        if (choice.kind === 'saved') usePrViewStore.getState().showSavedView(choice.id);
        else usePrViewStore.getState().showBuiltInView(choice.key);
        setPending(null);
      }, leavingFor(overrides));
    },
    [animateChange, leavingFor],
  );

  const handleDisplay = useCallback(
    (patch: Partial<PrDisplay>) => {
      settleChange();
      const next = { ...usePrViewStore.getState().display, ...patch };
      animateChange(
        () => usePrViewStore.getState().setDisplay(patch),
        leavingFor({ display: next }),
      );
    },
    [animateChange, leavingFor],
  );

  const handleSort = useCallback(
    (sortBy: PrSortBy) => {
      settleChange();
      handleDisplay(sortPatch(usePrViewStore.getState().display, sortBy));
    },
    [handleDisplay],
  );

  const handleHideFailing = useCallback(
    (hide: boolean) => {
      settleChange();
      animateChange(
        () => usePrStore.getState().setHideFailing(hide),
        leavingFor({ hideFailing: hide }),
      );
    },
    [animateChange, leavingFor],
  );

  /** A reviewer's row in Review load: the PRs waiting on them. */
  const showReviewer = useCallback(
    (login: string) => {
      settleChange();
      const query = `reviewer:${login}`;
      animateChange(
        () => {
          usePrViewStore.getState().showBuiltInView('all');
          usePrStore.getState().setSearchQuery(query);
        },
        leavingFor({ view: 'all', query }),
      );
    },
    [animateChange, leavingFor],
  );

  const columns = visibleColumns(display);
  const layout = display.layout;
  const setup: RowSetup = {
    columns: layout === 'list' ? ['checks', 'next'] : columns,
    groupBy: display.groupBy,
    density,
    now,
    me: username.toLowerCase(),
  };
  const listStyle = { '--bd-prl-cols': tableTemplate(setup.columns) } as CSSProperties;
  const ctx = useMemo(() => ({ username, now }), [username, now]);
  // The filter menu counts values over the tab's PRs, before any qualifier.
  const tabFacts = useMemo(
    () => model.facts.filter((f) => inView(f, filter)),
    [model.facts, filter],
  );

  const terms = parsed.terms;
  const canSave = !activeViewId && (hasTerms(searchQuery) || filter !== 'all');
  const head = (
    <>
      <PrListHead />
      <PrViewTabs
        pending={pending}
        counts={model.counts}
        savedCounts={model.savedCounts}
        onPick={handlePick}
      />
      <div className="bd-prl-bar" data-view-bar="">
        <FilterChips terms={terms} facts={tabFacts} ctx={ctx} />
        <AddFilterButton facts={tabFacts} ctx={ctx} />
        {hideFailing && filter !== 'failing' && (
          <span className="bd-prl-fchip bd-prl-fchip--state" data-hide-failing-chip="">
            <span className="bd-prl-fchip__body bd-prl-fchip__body--static">
              <EyeOff size={11} strokeWidth={2.25} aria-hidden="true" />
              Failing hidden
            </span>
            <button
              type="button"
              className="bd-prl-fchip__x"
              aria-label="Show PRs with failing checks again"
              onClick={() => handleHideFailing(false)}
            >
              <X size={11} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        )}
        {terms.length > 0 && (
          <button
            type="button"
            className="bd-prl-btn bd-prl-btn--quiet"
            onClick={() => usePrStore.getState().setSearchQuery(clearTerms(searchQuery))}
          >
            Clear
          </button>
        )}
        <span className="bd-prl-bar__spacer" />
        {activeViewId && edited && (
          <>
            <button
              type="button"
              className="bd-prl-btn bd-prl-btn--quiet"
              onClick={() => usePrViewStore.getState().revertActiveView()}
            >
              Discard
            </button>
            <button
              type="button"
              className="bd-prl-btn bd-prl-btn--outline"
              onClick={() => usePrViewStore.getState().updateActiveView()}
              data-update-view=""
            >
              Update view
            </button>
          </>
        )}
        {canSave && <span className="bd-prl-bar__hint">“+ View” saves these filters</span>}
        <GroupButton display={display} onChange={handleDisplay} />
        <SortButton display={display} onChange={handleDisplay} />
        <DisplayButton
          display={display}
          onChange={handleDisplay}
          onHideFailing={handleHideFailing}
        />
      </div>
      <ReviewSessionProgress />
    </>
  );

  if (!lastPollTime && isPolling && !hasData) {
    return (
      <div className="bd-wb-prs">
        {head}
        <SkeletonRows />
      </div>
    );
  }

  // A related-failure filter asks about a handful of PRs; the team-wide groups would bury them.
  const showClosed = layout !== 'board' && !relatedFailure && closedFacts.length > 0;
  const showReviewLoad = layout !== 'board' && !relatedFailure && reviewers.length > 0;
  const empty = model.rows.length === 0;

  return (
    <div className="bd-wb-prs">
      {head}
      <div className="bd-prl-attn">
        <CiFailureStrip />
        {!relatedFailure && <DependencyStrip />}
      </div>
      <div
        ref={listRef}
        className="bd-wb-list bd-prl-list"
        data-density={density}
        data-layout={layout}
        style={listStyle}
      >
        {empty && (
          <div className="bd-wb-empty">
            <GitPullRequest size={28} strokeWidth={1.5} aria-hidden="true" />
            <p>
              {filter === 'all' && !searchQuery
                ? 'No open pull requests'
                : 'No pull requests match this view'}
            </p>
          </div>
        )}

        {layout === 'board' ? (
          !empty && <PrBoard groups={model.groups} now={now} />
        ) : (
          <>
            {layout === 'table' && !empty && (
              <PrTableHead columns={setup.columns} display={display} onSort={handleSort} />
            )}
            {model.groups.map((group) => (
              <PrGroupSection
                key={group.key}
                group={group}
                setup={setup}
                aside={
                  (group.key === YOUR_TURN_GROUP_KEY ||
                    (group.kind === 'status' && group.bucket === 'yourTurn')) &&
                  oldestRequest ? (
                    <OldestRequest pr={oldestRequest} username={username} />
                  ) : undefined
                }
              />
            ))}
          </>
        )}

        {showReviewLoad && (
          <WorkbenchGroup groupKey="review-load" label="Review load" count={reviewers.length}>
            <div className="bd-wb-review-load">
              {reviewers.map((r) => (
                <ReviewerRow
                  key={r.login}
                  reviewer={r}
                  onSelect={(reviewer) => showReviewer(reviewer.login)}
                />
              ))}
            </div>
          </WorkbenchGroup>
        )}

        {showClosed && (
          <WorkbenchGroup
            groupKey="recently-closed"
            label="Recently closed"
            count={closedFacts.length}
          >
            <div className="bd-wb-closed">
              <PrRows facts={closedFacts} setup={{ ...setup, groupBy: 'none' }} />
            </div>
          </WorkbenchGroup>
        )}
      </div>
    </div>
  );
}
