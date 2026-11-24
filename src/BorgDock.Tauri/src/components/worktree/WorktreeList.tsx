import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RefreshCw, Scissors, Search, Star } from 'lucide-react';
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { IconButton, Pill } from '@/components/shared/primitives';
import { diskForPath, freshDisks } from '@/services/disk-space';
import { usePrStore } from '@/stores/pr-store';
import { WORKTREES_UPDATED_EVENT, type WorktreeSnapshot } from '@/types/worktree';
import { flip } from '@/utils/motion';
import { useWorktreeFavorites } from './useWorktreeFavorites';
import { useHostDisks, WorktreeHostHeader } from './WorktreeHostHeader';
import { WorktreePruneDialog } from './WorktreePruneDialog';
import { WorktreeRow } from './WorktreeRow';
import {
  flattenSnapshot,
  groupByHost,
  hostDisplayName,
  rowsInOrder,
  visibleEntries,
  type WorktreeListEntry,
  type WorktreeRepoError,
  worktreeKey,
} from './worktree-list-model';

export interface WorktreeListHandle {
  /** The window was shown again: clear the search, revalidate, refocus. */
  reset: () => void;
}

export interface WorktreeListStatus {
  shown: number;
  total: number;
  favoritesOnly: boolean;
}

export interface WorktreeListProps {
  ref?: Ref<WorktreeListHandle>;
  /** `Esc` with an empty search: the window hides itself. */
  onClose?: () => void;
  /** The title bar, drawn above the toolbar. */
  header?: ReactNode;
  /** The status bar, drawn below the list. */
  renderStatus?: (status: WorktreeListStatus) => ReactNode;
  /**
   * Runs once, on the first paint with the cached rows (or after 100 ms
   * without them), before the background revalidation. The window fits and
   * reveals itself here.
   */
  onReveal?: (api: { focusSearch: () => void }) => Promise<void> | void;
}

const FLIP_SELECTOR = '[data-key]';

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * WorktreeList — the body of the worktrees tool window (Ctrl+F7): every
 * worktree of the configured repositories, grouped by host (this machine,
 * then each SSH host, headed by its disk space) and then by repository, with
 * search, favourites (a star per row and a favourites-only filter), prune,
 * refresh, and open in terminal, folder or editor.
 *
 * Hover selects, ↑/↓ move, Enter opens a terminal, Esc clears the search,
 * then hides the window. Rows link no pull requests and so offer no Open in
 * T3: this window's PR store is never polled.
 *
 * Data comes from the Rust worktree cache: the instant snapshot on mount,
 * a background revalidation after the first paint, and every
 * `worktrees-updated` broadcast. Search and the favourites filter FLIP the
 * rows.
 */
export function WorktreeList({ ref, onClose, header, renderStatus, onReveal }: WorktreeListProps) {
  const [allEntries, setAllEntries] = useState<WorktreeListEntry[]>([]);
  const [errors, setErrors] = useState<Map<string, WorktreeRepoError>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pruneOpen, setPruneOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const favorites = useWorktreeFavorites();
  const { favoriteKeys, favoritesOnly } = favorites;
  const prStatusKnown = usePrStore(
    (s) => (s.pullRequests?.length ?? 0) > 0 || (s.lastPollTime ?? null) !== null,
  );

  // ── Data: two-phase (cache snapshot → background revalidate) ──
  const applySnapshot = useCallback((snapshot: WorktreeSnapshot) => {
    const { entries, errors: errs } = flattenSnapshot(snapshot);
    setAllEntries(entries);
    setErrors(errs);
  }, []);

  // Ask Rust to rescan every repo. Never clears the current list; the fresh
  // snapshot replaces it when it lands (also broadcast as `worktrees-updated`).
  const refreshWorktrees = useCallback(async () => {
    setRefreshing(true);
    try {
      void import('@/stores/disk-space-store').then(({ useDiskSpaceStore }) =>
        useDiskSpaceStore.getState().refresh(),
      );
      const snapshot = await invoke<WorktreeSnapshot>('worktree_cache_refresh');
      applySnapshot(snapshot);
    } catch {
      // Keep showing the cached rows; per-repo errors arrive via the snapshot.
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot]);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const reloadFavorites = favorites.reload;

  // Mount: render the cached snapshot immediately, reveal on the next paint
  // (skeleton if the cache is cold), then revalidate in the background.
  // Favourites load in parallel and never gate the reveal.
  const revealedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const snapshotReady = invoke<WorktreeSnapshot>('worktree_cache_get_all')
      .then((snapshot) => {
        if (!cancelled) applySnapshot(snapshot);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void reloadFavorites();

    (async () => {
      // Give the instant snapshot IPC a moment so the first paint includes
      // cached rows, but never wait on it for long: reveal is "on mount",
      // not "after data".
      await Promise.race([snapshotReady, new Promise((r) => setTimeout(r, 100))]);
      if (cancelled || revealedRef.current) return;
      await nextFrame();
      if (cancelled || revealedRef.current) return;
      revealedRef.current = true;
      await onRevealRef.current?.({ focusSearch });
      void refreshWorktrees();
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, reloadFavorites, refreshWorktrees, focusSearch]);

  // Any refresh anywhere (startup prefetch, create/remove worktree in the
  // main window, a refresh here) broadcasts the new snapshot.
  useEffect(() => {
    const unlisten = listen<WorktreeSnapshot>(WORKTREES_UPDATED_EVENT, (event) => {
      applySnapshot(event.payload);
      setLoading(false);
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [applySnapshot]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        setQuery('');
        setSelectedIndex(0);
        void refreshWorktrees();
        void reloadFavorites();
        requestAnimationFrame(() => searchRef.current?.focus());
      },
    }),
    [refreshWorktrees, reloadFavorites],
  );

  // ── Filtered + sorted + grouped data ──
  const filtered = useMemo(
    () => visibleEntries(allEntries, query, favoritesOnly, favoriteKeys),
    [allEntries, query, favoritesOnly, favoriteKeys],
  );
  // Hosts measured for disk space head their worktrees; with a search on,
  // only hosts with a matching row (or a failed scan) stay.
  const disk = useHostDisks();
  const measured = useMemo(() => disk.hosts.map(({ id, label }) => ({ id, label })), [disk.hosts]);
  const hosts = useMemo(
    () => groupByHost(filtered, errors, query || allEntries.length === 0 ? [] : measured),
    [filtered, errors, query, allEntries.length, measured],
  );
  const ordered = useMemo(() => rowsInOrder(hosts), [hosts]);

  // A new search starts at the top.
  useEffect(() => {
    void query;
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = rowRefs.current.get(selectedIndex);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Search and filter, with FLIP ──
  const changeQuery = useCallback((value: string) => {
    void flip(listRef.current, () => flushSync(() => setQuery(value)), FLIP_SELECTOR);
  }, []);

  const toggleFavoritesOnly = useCallback(() => {
    const turningOn = !favoritesOnly;
    const leaving = turningOn
      ? filtered
          .filter((e) => !e.wt.isMainWorktree && !favoriteKeys.has(worktreeKey(e.repo, e.wt.path)))
          .map((e) => worktreeKey(e.repo, e.wt.path))
      : [];
    void flip(
      listRef.current,
      () => flushSync(() => void favorites.toggleFavoritesOnly()),
      FLIP_SELECTOR,
      { leaving },
    );
  }, [favoritesOnly, filtered, favoriteKeys, favorites]);

  // ── Actions ──
  const openTerminal = useCallback((entry: WorktreeListEntry) => {
    invoke('open_in_terminal', { path: entry.wt.path }).catch(console.debug);
  }, []);
  const openFolder = useCallback((entry: WorktreeListEntry) => {
    invoke('reveal_in_file_manager', { path: entry.wt.path }).catch(console.debug);
  }, []);
  const openEditor = useCallback((entry: WorktreeListEntry) => {
    invoke('open_in_editor', { path: entry.wt.path }).catch(console.debug);
  }, []);

  const closePrune = useCallback(() => {
    setPruneOpen(false);
    void refreshWorktrees();
  }, [refreshWorktrees]);

  const moveSelection = (delta: 1 | -1) => {
    if (ordered.length === 0) return;
    setSelectedIndex((i) => Math.max(0, Math.min(i + delta, ordered.length - 1)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveSelection(-1);
        break;
      case 'Enter': {
        e.preventDefault();
        const entry = ordered[selectedIndex];
        if (entry && !entry.repo.remote) openTerminal(entry);
        break;
      }
      case 'Escape':
        e.preventDefault();
        if (query) changeQuery('');
        else onClose?.();
        break;
    }
  };

  // ── Render ──
  const totalCount = allEntries.length;
  const showScanning = loading || (refreshing && allEntries.length === 0 && errors.size === 0);

  let flatIndex = 0;
  const renderRow = (entry: WorktreeListEntry) => {
    const idx = flatIndex++;
    return (
      <WorktreeRow
        key={`${entry.repo.remote?.id ?? 'local'}:${entry.wt.path}`}
        entry={entry}
        isSelected={idx === selectedIndex}
        isFavorite={favoriteKeys.has(worktreeKey(entry.repo, entry.wt.path))}
        onSelect={() => setSelectedIndex(idx)}
        onOpenTerminal={() => openTerminal(entry)}
        onOpenFolder={() => openFolder(entry)}
        onOpenEditor={() => openEditor(entry)}
        onToggleFavorite={() => void favorites.toggleFavorite(entry)}
        rowRef={(el: HTMLDivElement | null) => {
          rowRefs.current.set(idx, el);
        }}
      />
    );
  };

  return (
    // `data-app-ready` flips to true once the initial worktree scan
    // resolves (success or failure). Playwright waits on this before
    // exercising the palette.
    <div
      className="bd-wt-palette"
      data-app-ready={loading ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      {header}

      <div className="bd-wt-toolbar">
        <div className="bd-wt-search-wrap">
          <Search className="bd-wt-search-icon" size={13} strokeWidth={2.4} aria-hidden />
          <input
            ref={searchRef}
            className="bd-input bd-wt-search"
            aria-label="Filter worktrees"
            placeholder="Filter by branch, folder, or repo..."
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            disabled={loading}
          />
          {query && (
            <button
              type="button"
              className="bd-wt-search-clear"
              onClick={() => {
                changeQuery('');
                searchRef.current?.focus();
              }}
              title="Clear"
            >
              {'✕'}
            </button>
          )}
        </div>
        <div className="bd-wt-toolbar-actions">
          <span
            className="bd-wt-count"
            aria-label={`${filtered.length} of ${totalCount} worktrees`}
          >
            {filtered.length}
          </span>
          <IconButton
            size={26}
            active={favoritesOnly}
            tooltip={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
            aria-pressed={favoritesOnly}
            onClick={toggleFavoritesOnly}
            icon={
              <Star size={13} strokeWidth={2.25} fill={favoritesOnly ? 'currentColor' : 'none'} />
            }
          />
          <IconButton
            size={26}
            tooltip="Prune worktrees"
            aria-label="Prune worktrees"
            onClick={() => setPruneOpen(true)}
            icon={<Scissors size={13} strokeWidth={2.25} />}
          />
          <IconButton
            size={26}
            tooltip="Refresh"
            onClick={() => void refreshWorktrees()}
            icon={
              <RefreshCw
                className={refreshing ? 'animate-spin' : undefined}
                size={13}
                strokeWidth={2.25}
              />
            }
          />
        </div>
      </div>

      <div ref={listRef} className="bd-wt-content">
        {showScanning && (
          <div className="bd-wt-loading">
            <span className="bd-wt-spinner" />
            <span>Scanning worktrees...</span>
          </div>
        )}

        {!loading && !refreshing && allEntries.length === 0 && errors.size === 0 && (
          <div className="bd-wt-empty">
            <span className="bd-wt-empty-title">No worktrees configured</span>
            <span className="bd-wt-empty-detail">
              Set a worktree base path under Settings &rarr; Repos
            </span>
          </div>
        )}

        {!loading && allEntries.length > 0 && filtered.length === 0 && query && (
          <div className="bd-wt-empty">
            <span className="bd-wt-empty-title">
              No worktrees matching &lsquo;<strong>{query}</strong>&rsquo;
            </span>
          </div>
        )}

        {!loading && allEntries.length > 0 && filtered.length === 0 && !query && favoritesOnly && (
          <div className="bd-wt-empty">
            <span className="bd-wt-empty-title">No favorite worktrees</span>
            <span className="bd-wt-empty-detail">
              Click the star on any worktree to mark it as a favorite
            </span>
          </div>
        )}

        {!loading &&
          hosts.map((host) => {
            const measurement = disk.hosts.find((h) => h.id === host.id);
            const hostDisks =
              measurement && freshDisks(measurement, disk.now) ? measurement.disks : [];
            return (
              <section
                key={host.id}
                className="bd-wth-section"
                aria-label={hostDisplayName(host, measurement)}
              >
                <WorktreeHostHeader
                  host={host}
                  disks={measurement}
                  probeError={disk.error}
                  cleanup={disk.cleanup[host.id]}
                  now={disk.now}
                />
                {host.repos.map(({ key: repoKey, repo, entries, error }) => {
                  // One disk needs no naming; with several, each repository says which.
                  const drive =
                    hostDisks.length > 1 ? diskForPath(repo.basePath, hostDisks)?.drive : undefined;
                  return (
                    <div key={repoKey} className="bd-wts__group" role="group" aria-label={repoKey}>
                      <div className="bd-wts__group-head" data-key={`group:${repoKey}`}>
                        <span className="bd-wts__group-label">
                          {repo.owner}/{repo.name}
                        </span>
                        <span className="bd-wts__group-count">{entries.length}</span>
                        {drive && (
                          <span className="bd-wts__group-drive" title={`On ${drive}`}>
                            {drive}
                          </span>
                        )}
                        {repo.remote && <span className="bd-wts__group-note">read-only</span>}
                        {error && <Pill tone="error">error</Pill>}
                        <span className="bd-wts__group-rule" aria-hidden="true" />
                      </div>
                      {error && <div className="bd-wt-error-detail">{error}</div>}
                      <div className="bd-wts__rows">{entries.map(renderRow)}</div>
                    </div>
                  );
                })}
              </section>
            );
          })}
      </div>

      {renderStatus?.({ shown: filtered.length, total: totalCount, favoritesOnly })}
      <WorktreePruneDialog
        isOpen={pruneOpen}
        onClose={closePrune}
        repos={favorites.repos}
        prStatusKnown={prStatusKnown}
      />
    </div>
  );
}
