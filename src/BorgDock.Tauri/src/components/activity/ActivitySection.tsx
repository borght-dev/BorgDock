import { useVirtualizer } from '@tanstack/react-virtual';
import { save } from '@tauri-apps/plugin-dialog';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Button, Chip, Kbd, Seg2, Select } from '@/components/shared/primitives';
import * as api from '@/services/activity/api';
import { summaryLine } from '@/services/activity/copy';
import { retryFailedCommits } from '@/services/activity/ingest';
import type { ActivityCategory, ActivityCategoryGroup } from '@/services/activity/types';
import { useActivityStore } from '@/stores/activity-store';
import { type ActivityFilter, useActivityViewStore } from '@/stores/activity-view-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { showToast, toastError } from '@/stores/toast-store';
import { useUiStore } from '@/stores/ui-store';
import { shortcutLabel } from '@/utils/shortcut-label';
import { ActivityRow } from './ActivityRow';
import { buildRows } from './rows';

const FILTERS: readonly { value: ActivityFilter; label: string }[] = [
  { value: 'needs-you', label: 'Needs you' },
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
];

const GROUPS: readonly { value: ActivityCategoryGroup; label: string }[] = [
  { value: 'agents', label: 'Agents' },
  { value: 'pull-requests', label: 'Pull requests' },
  { value: 'ci', label: 'CI' },
  { value: 'workstreams', label: 'Workstreams' },
  { value: 'deployments', label: 'Deployments' },
  { value: 'work-items', label: 'Work items' },
];

/** "Nothing new since 09:12" and friends: what the list says when it is empty. */
function emptyText(filter: ActivityFilter, visitedAt: string | null): string {
  if (filter === 'needs-you') return 'Nothing needs you.';
  if (filter === 'unread') {
    if (!visitedAt) return 'Nothing new.';
    const time = new Date(visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Nothing new since ${time}.`;
  }
  return 'No activity yet. Entries appear as your agents, PRs, CI, workstreams and items change.';
}

async function exportJournal(): Promise<void> {
  try {
    const path = await save({
      defaultPath: 'borgdock-activity.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    const count = await api.exportTo(path);
    showToast({ message: `Exported ${count} entries.` });
  } catch (error) {
    toastError('Export failed', error);
  }
}

function Banners() {
  const commitErrors = useActivityStore((s) => s.commitErrors);
  const readOnly = useActivityStore((s) => s.readOnly);
  const recoveredFrom = useActivityStore((s) => s.recoveredFrom);
  const capacity = useActivityStore((s) => s.capacity);
  const firstError = Object.values(commitErrors)[0];
  return (
    <>
      {readOnly && (
        <div className="bd-dp-notice" role="status">
          <span>
            Written by a newer BorgDock. Activity shows what it has and records nothing new.
          </span>
        </div>
      )}
      {recoveredFrom && (
        <div className="bd-dp-notice" role="status">
          <span>
            The activity history could not be read, so it starts over. The old file is kept at{' '}
            {recoveredFrom}.
          </span>
        </div>
      )}
      {firstError && (
        <div className="bd-dp-notice" role="alert">
          <span>Activity could not be saved: {firstError}</span>
          <Button variant="secondary" size="sm" onClick={() => void retryFailedCommits()}>
            Retry
          </Button>
        </div>
      )}
      {capacity === 'full' && (
        <div className="bd-dp-notice" role="status">
          <span>
            More than 5,000 unread entries need you. Activity keeps them, but adds no other updates
            until some are read.
          </span>
          <span className="bd-act-notice__actions">
            <Button variant="ghost" size="sm" onClick={() => void exportJournal()}>
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void useActivityViewStore.getState().clearSource(null)}
            >
              Clear all
            </Button>
          </span>
        </div>
      )}
    </>
  );
}

function OfflineHosts() {
  const hosts = useDispatchStore((s) => s.hosts);
  const offline = hosts.filter((host) => !host.ok);
  if (offline.length === 0) return null;
  return (
    <div className="bd-act-offline" role="status">
      {offline.map((host) => (
        <span key={host.id} className="bd-act-offline__chip">
          {host.label} offline
          {host.at
            ? ` since ${new Date(host.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </span>
      ))}
    </div>
  );
}

/**
 * ActivitySection — what changed since you last checked, kept until you read
 * or dismiss it: one row per change with the action that fits, grouped by
 * day, an entity's updates of one day folded together. J/K move, Enter acts,
 * E reads, U unreads, # dismisses, Z undoes, Shift+E marks what is shown
 * read (keyboard.ts).
 */
export function ActivitySection() {
  const filter = useActivityViewStore((s) => s.filter);
  const group = useActivityViewStore((s) => s.group);
  const sourceId = useActivityViewStore((s) => s.sourceId);
  const search = useActivityViewStore((s) => s.search);
  const entries = useActivityViewStore((s) => s.entries);
  const total = useActivityViewStore((s) => s.total);
  const loaded = useActivityViewStore((s) => s.loaded);
  const error = useActivityViewStore((s) => s.error);
  const sources = useActivityViewStore((s) => s.sources);
  const selectedId = useActivityViewStore((s) => s.selectedId);
  const expandedId = useActivityViewStore((s) => s.expandedId);
  const openGroups = useActivityViewStore((s) => s.openGroups);
  const counts = useActivityStore((s) => s.counts);
  const revision = useActivityStore((s) => s.counts?.revision ?? 0);
  const visitedAt = useUiStore((s) => s.activityVisitedAt);
  // Day headings ("Today") follow the page; a new page comes with every change.
  const now = useMemo(() => {
    void entries;
    return new Date();
  }, [entries]);

  useEffect(() => {
    void useActivityViewStore.getState().loadSources();
    return () => useUiStore.getState().markActivityVisited();
  }, []);
  // A commit or a mark in any window moves the revision: read the page again.
  useEffect(() => {
    void revision;
    void useActivityViewStore.getState().refresh();
  }, [revision]);

  const rows = useMemo(() => buildRows(entries, openGroups, now), [entries, openGroups, now]);
  const labels = useMemo(
    () => new Map(sources.map((source) => [source.sourceId, source])),
    [sources],
  );
  const summary = useMemo(() => {
    const byCategory = Object.fromEntries(
      Object.entries(counts?.byCategory ?? {}).map(([category, count]) => [
        category,
        count?.unread ?? 0,
      ]),
    ) as Partial<Record<ActivityCategory, number>>;
    return summaryLine(byCategory);
  }, [counts]);

  const parent = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: (index) => (rows[index]?.kind === 'day' ? 28 : 52),
    getItemKey: (index) => rows[index]!.key,
    initialRect: { width: 1000, height: 600 },
    overscan: 12,
  });
  useEffect(() => {
    const index = rows.findIndex((row) => row.kind === 'entry' && row.entry.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [rows, selectedId, virtualizer]);

  const sourceOptions = [
    { value: '', label: 'All sources' },
    ...sources.map((source) => ({
      value: source.sourceId,
      label: source.retiredAt ? `${source.label} (removed)` : source.label,
    })),
  ];

  return (
    <div className="bd-wb-prs bd-act">
      <header className="bd-wb-head bd-act-head">
        <h1 className="bd-wb-head__title">Activity</h1>
        <Seg2
          ariaLabel="Show entries"
          size="sm"
          value={filter}
          options={FILTERS}
          onChange={(value) => useActivityViewStore.getState().setFilter(value)}
        />
        <span className="bd-act-head__spacer" />
        <Button
          variant="ghost"
          size="sm"
          aria-keyshortcuts="Shift+E"
          disabled={!entries.some((entry) => entry.read === 'unread')}
          onClick={() => void useActivityViewStore.getState().markShownRead()}
        >
          Mark shown read
        </Button>
        <label className="bd-wb-head__search">
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="bd-wb-head__search-icon"
          />
          <input
            aria-label="Search activity"
            type="text"
            value={search}
            onChange={(e) => useActivityViewStore.getState().setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              if (search !== '') useActivityViewStore.getState().setSearch('');
              else e.currentTarget.blur();
            }}
            placeholder="Search"
            data-section-search
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </label>
      </header>
      <div className="bd-act-bar">
        {summary && <p className="bd-act-bar__summary">{summary}</p>}
        <div className="bd-act-bar__filters">
          {GROUPS.map((option) => (
            <Chip
              key={option.value}
              active={group === option.value}
              onClick={() =>
                useActivityViewStore
                  .getState()
                  .setGroup(group === option.value ? null : option.value)
              }
            >
              {option.label}
            </Chip>
          ))}
          <span className="bd-act-bar__source">
            <Select
              ariaLabel="Source"
              value={sourceId ?? ''}
              options={sourceOptions}
              onChange={(value) => useActivityViewStore.getState().setSource(value || null)}
            />
          </span>
          {sourceId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void useActivityViewStore.getState().clearSource(sourceId)}
            >
              Clear history
            </Button>
          )}
        </div>
      </div>
      <Banners />
      <OfflineHosts />
      {error && (
        <div className="bd-dp-notice" role="alert">
          <span>Activity could not be read: {error}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void useActivityViewStore.getState().refresh()}
          >
            Try again
          </Button>
        </div>
      )}
      {!loaded ? (
        <div className="bd-act-empty" role="status">
          Loading activity…
        </div>
      ) : rows.length === 0 ? (
        <div className="bd-act-empty">
          <p>{emptyText(filter, visitedAt)}</p>
          {filter !== 'all' && (
            <p className="bd-act-empty__hint">
              BorgDock records while it runs. A question asked and answered while the laptop slept
              leaves no trace.
            </p>
          )}
        </div>
      ) : (
        <div
          ref={parent}
          className="bd-wb-virtual bd-act-list"
          role="list"
          aria-label="Activity"
          data-virtual=""
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="bd-wb-virtual__item"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {row.kind === 'day' ? (
                    <h2 className="bd-act-day">{row.label}</h2>
                  ) : (
                    <ActivityRow
                      entry={row.entry}
                      folded={row.folded}
                      group={row.group}
                      child={row.child}
                      open={openGroups.has(row.group)}
                      selected={row.entry.id === selectedId}
                      expanded={row.entry.id === expandedId}
                      sourceLabel={labels.get(row.entry.sourceId)?.label ?? row.entry.sourceId}
                      retired={!!labels.get(row.entry.sourceId)?.retiredAt}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {entries.length < total && (
            <div className="bd-act-more">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void useActivityViewStore.getState().loadOlder()}
              >
                Show older ({total - entries.length} more)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
