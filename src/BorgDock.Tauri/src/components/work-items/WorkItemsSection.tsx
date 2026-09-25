import { ListFilter, Search } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { groupFlipKey, WorkbenchGroup } from '@/components/pr/RepoGroup';
import { HoverPopover, Kbd } from '@/components/shared/primitives';
import { useWorkItemHandlers } from '@/hooks/useWorkItemHandlers';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import {
  filterWorkItems,
  useWorkItemsStore,
  type WorkItemFilterCriteria,
} from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import { EASE_OUT, flip, motionMs, motionOK } from '@/utils/motion';
import { shortcutLabel } from '@/utils/shortcut-label';
import { flattenQueries, getField } from '@/utils/work-item-helpers';
import { AdoNotConfigured } from './AdoNotConfigured';
import { QueriesRail, type QueryRowData } from './QueriesRail';
import { type AdoQueryTreeNode, QueryBrowser } from './QueryBrowser';
import { WorkItemFilterPopover } from './WorkItemFilterPopover';
import { queryPickerMode, WorkItemQueryPicker } from './WorkItemQueryPicker';
import { WorkItemRow, type WorkItemRowData, workItemRowKey } from './WorkItemRow';

/** Rows and group headings `flip()` follows. */
const FLIP_SELECTOR = '[data-key]';

/** Group heading key of the rows in one state. */
export function stateGroupKey(state: string): string {
  return `wi-state:${state || 'none'}`;
}

interface StateGroup {
  state: string;
  rows: WorkItemRowData[];
}

/** Rows grouped by state, groups in the order their first item appears in the query. */
export function groupByState(rows: WorkItemRowData[]): StateGroup[] {
  const groups = new Map<string, StateGroup>();
  for (const row of rows) {
    let group = groups.get(row.state);
    if (!group) {
      group = { state: row.state, rows: [] };
      groups.set(row.state, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

function toRow(item: WorkItem, tracked: Set<number>, working: Set<number>): WorkItemRowData {
  return {
    id: item.id,
    type: getField(item, 'System.WorkItemType') || 'Task',
    title: getField(item, 'System.Title'),
    state: getField(item, 'System.State'),
    priority: Number(item.fields['Microsoft.VSTS.Common.Priority']) || undefined,
    isTracked: tracked.has(item.id),
    isWorking: working.has(item.id),
  };
}

/** The flip keys (rows and headings) of the rows `items` would show. */
function flipKeysOf(items: WorkItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    keys.add(workItemRowKey(item.id));
    keys.add(groupFlipKey(stateGroupKey(getField(item, 'System.State'))));
  }
  return keys;
}

/**
 * The selected query once its results have landed: the work item list is a
 * new one since the query was picked and loading is over. `null` while the
 * query's results are still on their way (the old rows are showing).
 */
export function useQuerySettled(
  queryId: string | null,
  workItems: WorkItem[],
  isLoading: boolean,
): string | null {
  // The list that was showing when the query changed.
  const [pending, setPending] = useState<{ queryId: string | null; items: WorkItem[] | null }>(
    () => ({ queryId, items: null }),
  );
  if (pending.queryId !== queryId) {
    setPending({ queryId, items: workItems });
  }
  const current = pending.queryId === queryId ? pending : { queryId, items: workItems };
  if (isLoading) return null;
  if (current.items !== null && current.items === workItems) return null;
  return queryId;
}

/**
 * WorkItemsSection — the Work items section of the main window
 * (plans/ui-overhaul-workbench.md, phase 5).
 *
 * - Head row: title, the query picker (segmented for a few favourites, a
 *   select for a short list; a long list keeps the queries rail beside the
 *   list), search with the `⌘K` hint, and the state / assignee / tracking
 *   filter.
 * - Rows (`WorkItemRow`) grouped by state under sentence-case
 *   headings with a count and a hairline. A row opens the full-screen detail
 *   view; J / K / Enter move and open (useKeyboardNav).
 * - Filter and search changes FLIP the rows: rows that leave fade first,
 *   survivors glide, new rows fade in. A new query's results replace the list
 *   wholesale, so they crossfade in instead.
 */
export function WorkItemsSection() {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');

  const queryTree = useWorkItemsStore((s) => s.queryTree);
  const selectedQueryId = useWorkItemsStore((s) => s.selectedQueryId);
  const favoriteQueryIds = useWorkItemsStore((s) => s.favoriteQueryIds);
  const workItems = useWorkItemsStore((s) => s.workItems);
  const stateFilter = useWorkItemsStore((s) => s.stateFilter);
  const assignedToFilter = useWorkItemsStore((s) => s.assignedToFilter);
  const searchQuery = useWorkItemsStore((s) => s.searchQuery);
  const trackingFilter = useWorkItemsStore((s) => s.trackingFilter);
  const trackedIds = useWorkItemsStore((s) => s.trackedWorkItemIds);
  const workingIds = useWorkItemsStore((s) => s.workingOnWorkItemIds);
  const currentUser = useWorkItemsStore((s) => s.currentUserDisplayName);
  const isLoading = useWorkItemsStore((s) => s.isLoading);
  const availableStates = useWorkItemsStore((s) => s.availableStates);
  const availableAssignees = useWorkItemsStore((s) => s.availableAssignees);
  const selectedId = useUiStore((s) => s.workItemsSelectedId);

  // Query selection, favourites and the query browser.
  const { queryBrowserOpen, setQueryBrowserOpen, handleSelectQuery, handleToggleFavorite } =
    useWorkItemHandlers();

  const visible = useMemo(
    () =>
      filterWorkItems(workItems, {
        stateFilter,
        assignedToFilter,
        searchQuery,
        trackingFilter,
        trackedWorkItemIds: trackedIds,
        workingOnWorkItemIds: workingIds,
        currentUserDisplayName: currentUser,
      }),
    [
      workItems,
      stateFilter,
      assignedToFilter,
      searchQuery,
      trackingFilter,
      trackedIds,
      workingIds,
      currentUser,
    ],
  );
  const rows = useMemo(
    () => visible.map((item) => toRow(item, trackedIds, workingIds)),
    [visible, trackedIds, workingIds],
  );
  const groups = useMemo(() => groupByState(rows), [rows]);

  // Queries for the picker, the rail and the browser.
  const allQueries = useMemo(() => flattenQueries(queryTree), [queryTree]);
  const favorites: QueryRowData[] = useMemo(
    () =>
      allQueries
        .filter((q) => !q.isFolder && favoriteQueryIds.includes(q.id))
        .map((q) => ({ id: q.id, name: q.name })),
    [allQueries, favoriteQueryIds],
  );
  const myQueries: QueryRowData[] = useMemo(() => {
    const fav = new Set(favoriteQueryIds);
    return allQueries
      .filter((q) => !q.isFolder && !fav.has(q.id))
      .slice(0, 50)
      .map((q) => ({ id: q.id, name: q.name }));
  }, [allQueries, favoriteQueryIds]);
  const selectedQueryName = allQueries.find((q) => q.id === selectedQueryId)?.name;
  const pickerMode = queryPickerMode(favorites.length, myQueries.length);

  const queryTreeNodes: AdoQueryTreeNode[] = useMemo(() => {
    function map(qs: typeof queryTree): AdoQueryTreeNode[] {
      return qs.map((q) => ({
        ...q,
        isFavorite: favoriteQueryIds.includes(q.id),
        isExpanded: false,
        children: map(q.children),
      }));
    }
    return map(queryTree);
  }, [queryTree, favoriteQueryIds]);
  const favoriteNodes: AdoQueryTreeNode[] = useMemo(
    () =>
      allQueries
        .filter((q) => favoriteQueryIds.includes(q.id))
        .map((q) => ({ ...q, isFavorite: true, isExpanded: false, children: [] })),
    [allQueries, favoriteQueryIds],
  );

  // ---- Motion ----

  const listRef = useRef<HTMLDivElement>(null);
  const changeToken = useRef(0);
  useEffect(
    () => () => {
      changeToken.current++;
    },
    [],
  );

  /**
   * Applies a filter change (`patch` to the store's filter fields) through
   * FLIP: the rows and headings it removes fade out first. Typing in the
   * search box (`fadeLeaving: false`) applies at once, so the input keeps
   * up; the rows that stay still glide into place.
   */
  const changeFilter = useCallback((patch: Partial<WorkItemFilterCriteria>, fadeLeaving = true) => {
    const state = useWorkItemsStore.getState();
    let leaving: string[] = [];
    if (fadeLeaving) {
      const before = flipKeysOf(filterWorkItems(state.workItems, state));
      const after = flipKeysOf(filterWorkItems(state.workItems, { ...state, ...patch }));
      leaving = [...before].filter((k) => !after.has(k));
    }
    const token = ++changeToken.current;
    void flip(
      listRef.current,
      () => {
        if (token !== changeToken.current) return;
        flushSync(() => useWorkItemsStore.setState(patch));
      },
      FLIP_SELECTOR,
      { leaving },
    );
  }, []);

  // A new query's results crossfade in (nothing to FLIP between two queries).
  // They count as landed once, since the query changed, the store holds a new
  // list *and* is done loading: one "settled" signal, so the fade never runs
  // on the old rows when only one of the two has happened.
  const settledQuery = useQuerySettled(selectedQueryId, workItems, isLoading);
  const shownQueryRef = useRef(selectedQueryId);
  useLayoutEffect(() => {
    if (settledQuery === null || shownQueryRef.current === settledQuery) return;
    shownQueryRef.current = settledQuery;
    const list = listRef.current;
    if (!list || !motionOK() || typeof list.animate !== 'function') return;
    list.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: motionMs('--motion-base', 260),
      easing: EASE_OUT,
    });
  }, [settledQuery]);

  const hasCredentials = ado.authMethod === 'azCli' || !!ado.personalAccessToken;
  if (!ado.organization || !hasCredentials) return <AdoNotConfigured />;

  const withRail = pickerMode === 'rail';

  return (
    <div className="bd-wb-prs bd-wi-wb" data-with-rail={withRail ? 'true' : undefined}>
      {queryBrowserOpen && (
        <div
          className="bd-modal-backdrop"
          onClick={() => setQueryBrowserOpen(false)}
          role="presentation"
        >
          <div
            className="bd-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <QueryBrowser
              queryTree={queryTreeNodes}
              favoriteQueries={favoriteNodes}
              isLoading={isLoading}
              selectedQueryId={selectedQueryId ?? undefined}
              onSelectQuery={handleSelectQuery}
              onToggleFavorite={handleToggleFavorite}
              onClose={() => setQueryBrowserOpen(false)}
            />
          </div>
        </div>
      )}

      <header className="bd-wb-head bd-wi-wb-head">
        <h1 className="bd-wb-head__title">Work items</h1>
        {!withRail && (
          <WorkItemQueryPicker
            mode={pickerMode}
            favorites={favorites}
            myQueries={myQueries}
            selectedId={selectedQueryId ?? undefined}
            selectedName={selectedQueryName}
            onSelectQuery={handleSelectQuery}
            onOpenQueryBrowser={() => setQueryBrowserOpen(true)}
          />
        )}
        <label className="bd-wb-head__search">
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="bd-wb-head__search-icon"
          />
          <input
            aria-label="Filter work items"
            type="text"
            value={searchQuery}
            onChange={(e) => changeFilter({ searchQuery: e.target.value }, false)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              if (searchQuery !== '') changeFilter({ searchQuery: '' }, false);
              else e.currentTarget.blur();
            }}
            placeholder="Search work items"
            data-section-search
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </label>
        <HoverPopover
          maxWidth={260}
          maxHeight={320}
          content={
            <WorkItemFilterPopover
              states={availableStates()}
              assignees={availableAssignees()}
              selectedState={stateFilter === 'all' ? 'All' : stateFilter}
              selectedAssignee={assignedToFilter === '' ? 'Anyone' : assignedToFilter}
              trackingFilter={trackingFilter}
              onStateChange={(s) => changeFilter({ stateFilter: s === 'All' ? 'all' : s })}
              onAssigneeChange={(a) => changeFilter({ assignedToFilter: a === 'Anyone' ? '' : a })}
              onTrackingChange={(t) => changeFilter({ trackingFilter: t })}
            />
          }
        >
          <button
            type="button"
            className="bd-wb-head__menu-btn"
            aria-label="Filter work items"
            data-active={
              stateFilter !== 'all' || assignedToFilter !== '' || trackingFilter !== 'all'
                ? 'true'
                : undefined
            }
          >
            <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </HoverPopover>
      </header>

      <div className="bd-wi-wb__body">
        {withRail && (
          <QueriesRail
            favorites={favorites}
            myQueries={myQueries}
            selectedId={selectedQueryId ?? undefined}
            onSelectQuery={handleSelectQuery}
            onToggleFavorite={handleToggleFavorite}
            onOpenQueryBrowser={() => setQueryBrowserOpen(true)}
          />
        )}
        <div ref={listRef} className="bd-wb-list bd-wi-wb-list" data-density={density}>
          {isLoading && rows.length === 0 && <div className="bd-wb-empty">Loading work items…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="bd-wb-empty">
              <p>
                {!selectedQueryId
                  ? 'Pick a query to see its work items'
                  : workItems.length > 0
                    ? 'No work items match this filter'
                    : `No work items in ${selectedQueryName ?? 'this query'}`}
              </p>
            </div>
          )}
          {groups.map((group) => (
            <WorkbenchGroup
              key={group.state}
              groupKey={stateGroupKey(group.state)}
              label={group.state || 'No state'}
              count={group.rows.length}
            >
              {group.rows.map((row) => (
                <WorkItemRow
                  key={row.id}
                  item={row}
                  density={density}
                  selected={selectedId === row.id}
                />
              ))}
            </WorkbenchGroup>
          ))}
        </div>
      </div>
    </div>
  );
}
