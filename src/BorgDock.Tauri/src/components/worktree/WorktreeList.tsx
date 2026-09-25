import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AppWindow, RefreshCw, Scissors, Search, Star } from 'lucide-react';
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
import { Button, IconButton, Kbd, Pill } from '@/components/shared/primitives';
import { publishWorktreeCount } from '@/hooks/useWorktreeMap';
import { createLogger } from '@/services/logger';
import { isOverlayOpen, showPr } from '@/services/navigation';
import { openT3Thread } from '@/services/t3-thread';
import { markWorktreeUsed, readWorktreeUsage } from '@/services/worktree-usage';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { WORKTREES_UPDATED_EVENT, type WorktreeSnapshot } from '@/types/worktree';
import { flip } from '@/utils/motion';
import { minuteNow } from '@/utils/relative-time';
import { shortcutLabel } from '@/utils/shortcut-label';
import { useLinkedPrs, useWorktreeStatuses } from './useWorktreeDetails';
import { useWorktreeFavorites } from './useWorktreeFavorites';
import { WorktreePruneDialog } from './WorktreePruneDialog';
import { PaletteWorktreeRow, SectionWorktreeRow } from './WorktreeRows';
import {
  flattenSnapshot,
  groupByRepo,
  visibleEntries,
  type WorktreeListEntry,
  worktreeKey,
} from './worktree-list-model';

const log = createLogger('worktree-list');

/** Where the list lives: the worktrees tool window, or the main window's section. */
export type WorktreeListHost = 'window' | 'section';

export interface WorktreeListHandle {
  /** The tool window was shown again: clear the search, revalidate, refocus. */
  reset: () => void;
}

export interface WorktreeListStatus {
  shown: number;
  total: number;
  favoritesOnly: boolean;
}

export interface WorktreeListProps {
  host: WorktreeListHost;
  ref?: Ref<WorktreeListHandle>;
  /**
   * `Esc` with an empty search: the tool window hides itself, the section
   * closes the changes beside the list.
   */
  onClose?: () => void;
  /** Tool window: the title bar, drawn above the toolbar. */
  header?: ReactNode;
  /** Tool window: the status bar, drawn below the list. */
  renderStatus?: (status: WorktreeListStatus) => ReactNode;
  /**
   * Runs once, on the first paint with the cached rows (or after 100 ms
   * without them), before the background revalidation. The tool window
   * fits and reveals itself here.
   */
  onReveal?: (api: { focusSearch: () => void }) => Promise<void> | void;
  /** Section: the worktree whose changes are showing. */
  openPath?: string | null;
  /** Section: Enter or a click on a row shows that worktree's changes. */
  onOpenChanges?: (entry: WorktreeListEntry) => void;
  /** Section: drawn beside (or, narrow, below) the rows — the changes. */
  aside?: ReactNode;
}

const FLIP_SELECTOR = '[data-key]';

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Buttons and links, a row's body included: Enter on them is theirs. A
 * row's body reached with Tab is selected by its focus, so its own click
 * opens the row the user is on, not the one J/K selected earlier.
 */
function isControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('button, a[href], summary, [role="button"]') !== null;
}

/**
 * WorktreeList — every worktree of the configured repositories, grouped by
 * repository: search, favourites (a star per row and a favourites-only
 * filter), prune, refresh, and open in terminal, folder or editor (and, in
 * the section, in T3).
 *
 * One component, two hosts (plans/ui-overhaul-workbench.md, phase 5):
 *
 * - `window`, the Ctrl+F7 tool window: the palette rows. Hover selects,
 *   ↑/↓ move, Enter opens a terminal, Esc clears the search, then hides.
 *   No linked pull requests and so no Open in T3: that window's PR store
 *   is never polled.
 * - `section`, the main window's Worktrees section: a Workbench head row
 *   and rows on the `PrRowCore` grammar with the linked pull request, the
 *   working-tree state and when BorgDock last opened the worktree. A click
 *   or Enter shows the worktree's changes (`onOpenChanges`); ↑/↓ or J/K
 *   move, T opens T3, O a terminal, F toggles the favourite, Esc clears the
 *   search, then the changes, then the selection. These keys stand down
 *   while typing, while a dialog, menu or Quick Review is open, and while a
 *   detail view covers the list.
 *
 * Data comes from the Rust worktree cache: the instant snapshot on mount,
 * a background revalidation after the first paint, and every
 * `worktrees-updated` broadcast. Search and the favourites filter FLIP the
 * rows.
 */
export function WorktreeList({
  host,
  ref,
  onClose,
  header,
  renderStatus,
  onReveal,
  openPath = null,
  onOpenChanges,
  aside,
}: WorktreeListProps) {
  const isSection = host === 'section';
  const [allEntries, setAllEntries] = useState<WorktreeListEntry[]>([]);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(isSection ? -1 : 0);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [usage, setUsage] = useState(readWorktreeUsage);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const favorites = useWorktreeFavorites(host);
  const { favoriteKeys, favoritesOnly } = favorites;
  const linkedPrFor = useLinkedPrs();
  const statuses = useWorktreeStatuses(allEntries, isSection, refreshToken);
  const prStatusKnown = usePrStore(
    (s) => (s.pullRequests?.length ?? 0) > 0 || (s.lastPollTime ?? null) !== null,
  );

  // ── Data: two-phase (cache snapshot → background revalidate) ──
  const applySnapshot = useCallback((snapshot: WorktreeSnapshot) => {
    const { entries, errors: errs } = flattenSnapshot(snapshot);
    publishWorktreeCount(snapshot);
    setAllEntries(entries);
    setErrors(errs);
  }, []);

  // Ask Rust to rescan every repo. Never clears the current list; the fresh
  // snapshot replaces it when it lands (also broadcast as `worktrees-updated`).
  // A refresh the user asked for (the button, R, closing Prune) also rescans
  // the section's working-tree states; the background revalidation after
  // mount does not, or every visit would run `list_worktrees` twice.
  const refreshWorktrees = useCallback(
    async (userRequested = false) => {
      setRefreshing(true);
      try {
        const snapshot = await invoke<WorktreeSnapshot>('worktree_cache_refresh');
        applySnapshot(snapshot);
      } catch {
        // Keep showing the cached rows; per-repo errors arrive via the snapshot.
      } finally {
        setRefreshing(false);
        if (userRequested) setRefreshToken((n) => n + 1);
      }
    },
    [applySnapshot],
  );

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
  // main window, a refresh in the other host) broadcasts the new snapshot.
  useEffect(() => {
    const unlisten = listen<WorktreeSnapshot>(WORKTREES_UPDATED_EVENT, (event) => {
      applySnapshot(event.payload);
      setLoading(false);
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [applySnapshot]);

  // "Last used" times change in other windows too (the tool window opens
  // worktrees): re-read them when another window writes them and when this
  // window comes back to the front.
  useEffect(() => {
    if (!isSection) return;
    const reread = () => setUsage(readWorktreeUsage());
    const onVisible = () => {
      if (document.visibilityState === 'visible') reread();
    };
    window.addEventListener('storage', reread);
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', reread);
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isSection]);

  // The main window's refresh (R, Ctrl+R) rescans worktrees too while the
  // section is showing.
  useEffect(() => {
    if (!isSection) return;
    const onRefresh = () => void refreshWorktrees(true);
    document.addEventListener('borgdock-refresh', onRefresh);
    return () => document.removeEventListener('borgdock-refresh', onRefresh);
  }, [isSection, refreshWorktrees]);

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
  const grouped = useMemo(() => groupByRepo(filtered), [filtered]);

  // A new search starts at the top: the tool window selects the first row,
  // the section selects it only while there is a search.
  useEffect(() => {
    setSelectedIndex(isSection ? (query ? 0 : -1) : 0);
  }, [query, isSection]);

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
  const noteUsed = useCallback((entry: WorktreeListEntry) => {
    setUsage(markWorktreeUsed(worktreeKey(entry.repo, entry.wt.path)));
  }, []);

  const openTerminal = useCallback(
    (entry: WorktreeListEntry) => {
      noteUsed(entry);
      invoke('open_in_terminal', { path: entry.wt.path }).catch(console.debug);
    },
    [noteUsed],
  );
  const openFolder = useCallback(
    (entry: WorktreeListEntry) => {
      noteUsed(entry);
      invoke('reveal_in_file_manager', { path: entry.wt.path }).catch(console.debug);
    },
    [noteUsed],
  );
  const openEditor = useCallback(
    (entry: WorktreeListEntry) => {
      noteUsed(entry);
      invoke('open_in_editor', { path: entry.wt.path }).catch(console.debug);
    },
    [noteUsed],
  );
  const openT3 = useCallback(
    (entry: WorktreeListEntry, pr: PullRequestWithChecks | undefined) => {
      if (!pr || entry.repo.remote) return;
      noteUsed(entry);
      openT3Thread(pr.pullRequest, entry.wt.path).catch((err) =>
        log.error('open in T3 failed', err, { path: entry.wt.path }),
      );
    },
    [noteUsed],
  );
  const openPr = useCallback((pr: PullRequestWithChecks) => {
    const p = pr.pullRequest;
    void showPr({ owner: p.repoOwner, repo: p.repoName, number: p.number, keepSection: true });
  }, []);
  const openChanges = useCallback(
    (entry: WorktreeListEntry, index: number) => {
      setSelectedIndex(index);
      if (!entry.repo.remote) onOpenChanges?.(entry);
    },
    [onOpenChanges],
  );

  const closePrune = useCallback(() => {
    setPruneOpen(false);
    void refreshWorktrees(true);
  }, [refreshWorktrees]);

  const moveSelection = (delta: 1 | -1) => {
    if (filtered.length === 0) return;
    setSelectedIndex((i) => (i < 0 ? 0 : Math.max(0, Math.min(i + delta, filtered.length - 1))));
  };

  // ── Keyboard: search box and tool window (React, on the root) ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // In the section the root only handles the search box; the document
    // listener below owns every other key.
    if (isSection && e.target !== searchRef.current) return;
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
        const index = isSection && selectedIndex < 0 ? 0 : selectedIndex;
        const entry = filtered[index];
        if (!entry || entry.repo.remote) break;
        if (isSection) openChanges(entry, index);
        else openTerminal(entry);
        break;
      }
      case 'Escape':
        e.preventDefault();
        if (query) {
          changeQuery('');
        } else if (isSection) {
          searchRef.current?.blur();
        } else {
          onClose?.();
        }
        break;
    }
  };

  // ── Keyboard: the section's list keys (document, capture phase) ──
  // Capture so the main window's list keys (useKeyboardNav) never see a key
  // the worktree list used; everything else passes through untouched.
  const sectionKeyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  sectionKeyRef.current = (e: KeyboardEvent): boolean => {
    const selected = selectedIndex >= 0 ? filtered[selectedIndex] : undefined;
    const followFocus = (index: number) => {
      const list = listRef.current;
      if (!list?.contains(document.activeElement)) return;
      rowRefs.current
        .get(index)
        ?.querySelector<HTMLElement>('[data-worktree-open]')
        ?.focus({ preventScroll: true });
    };
    const move = (delta: 1 | -1) => {
      if (filtered.length === 0) return;
      const next =
        selectedIndex < 0 ? 0 : Math.max(0, Math.min(selectedIndex + delta, filtered.length - 1));
      setSelectedIndex(next);
      followFocus(next);
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        move(1);
        return true;
      case 'ArrowUp':
      case 'k':
      case 'K':
        move(-1);
        return true;
      case 'Enter':
        if (isControl(e.target) || !selected) return false;
        openChanges(selected, selectedIndex);
        return true;
      case 't':
      case 'T': {
        if (e.repeat || !selected || selected.repo.remote) return false;
        const pr = linkedPrFor(selected.repo, selected.wt.branchName);
        if (!pr) return false;
        openT3(selected, pr);
        return true;
      }
      case 'o':
      case 'O':
        if (e.repeat || !selected || selected.repo.remote) return false;
        openTerminal(selected);
        return true;
      case 'f':
      case 'F':
        if (e.repeat || !selected) return false;
        if (selected.wt.isMainWorktree && !selected.repo.remote) return false;
        void favorites.toggleFavorite(selected);
        return true;
      case 'Escape':
        if (query) {
          changeQuery('');
          return true;
        }
        if (openPath && onClose) {
          onClose();
          return true;
        }
        if (selectedIndex >= 0) {
          setSelectedIndex(-1);
          return true;
        }
        return false;
      default:
        return false;
    }
  };

  useEffect(() => {
    if (!isSection) return;
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root?.isConnected || root.closest('[inert]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (useUiStore.getState().viewStack.length > 1) return;
      if (isOverlayOpen()) return;
      if (!sectionKeyRef.current(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isSection]);

  // ── Render ──
  const totalCount = allEntries.length;
  const now = minuteNow();
  const showScanning = loading || (refreshing && allEntries.length === 0 && errors.size === 0);

  const searchInput = (
    <input
      ref={searchRef}
      className={isSection ? undefined : 'bd-input bd-wt-search'}
      aria-label="Filter worktrees"
      placeholder={isSection ? 'Search worktrees' : 'Filter by branch, folder, or repo...'}
      value={query}
      onChange={(e) => changeQuery(e.target.value)}
      disabled={!isSection && loading}
      data-section-search={isSection ? '' : undefined}
    />
  );

  const favoritesOnlyButton = (
    <IconButton
      size={26}
      active={favoritesOnly}
      tooltip={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
      aria-pressed={favoritesOnly}
      onClick={toggleFavoritesOnly}
      icon={<Star size={13} strokeWidth={2.25} fill={favoritesOnly ? 'currentColor' : 'none'} />}
    />
  );

  const refreshButton = (
    <IconButton
      size={26}
      tooltip="Refresh"
      onClick={() => void refreshWorktrees(true)}
      icon={
        <RefreshCw
          className={refreshing ? 'animate-spin' : undefined}
          size={13}
          strokeWidth={2.25}
        />
      }
    />
  );

  const emptyStates = (
    <>
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
    </>
  );

  let flatIndex = 0;
  const groups = loading
    ? null
    : [...new Set([...grouped.keys(), ...errors.keys()])].map((repoKey) => {
        const entries = grouped.get(repoKey) ?? [];
        const error = errors.get(repoKey);
        const rows = entries.map((entry) => {
          const idx = flatIndex++;
          const key = worktreeKey(entry.repo, entry.wt.path);
          const common = {
            entry,
            isSelected: idx === selectedIndex,
            isFavorite: favoriteKeys.has(key),
            onSelect: () => setSelectedIndex(idx),
            onOpenTerminal: () => openTerminal(entry),
            onOpenFolder: () => openFolder(entry),
            onOpenEditor: () => openEditor(entry),
            onToggleFavorite: () => void favorites.toggleFavorite(entry),
            rowRef: (el: HTMLDivElement | null) => {
              rowRefs.current.set(idx, el);
            },
          };
          if (!isSection) {
            return (
              <PaletteWorktreeRow
                key={`${entry.repo.remote?.id ?? 'local'}:${entry.wt.path}`}
                {...common}
              />
            );
          }
          // Linked pull requests (and so T3) exist only in the main window:
          // the tool window's PR store is never polled.
          const linkedPr = linkedPrFor(entry.repo, entry.wt.branchName);
          return (
            <SectionWorktreeRow
              key={`${entry.repo.remote?.id ?? 'local'}:${entry.wt.path}`}
              {...common}
              linkedPr={linkedPr}
              onOpenT3={() => openT3(entry, linkedPr)}
              isOpen={openPath === entry.wt.path}
              status={statuses.get(entry.wt.path)}
              lastUsedAt={usage[key]}
              now={now}
              onOpen={() => openChanges(entry, idx)}
              onOpenPr={openPr}
            />
          );
        });

        return (
          <div key={repoKey} className="bd-wts__group" role="group" aria-label={repoKey}>
            <div className="bd-wts__group-head" data-key={`group:${repoKey}`}>
              <span className="bd-wts__group-label">{repoKey}</span>
              <span className="bd-wts__group-count">{entries.length}</span>
              {error && <Pill tone="error">error</Pill>}
              <span className="bd-wts__group-rule" aria-hidden="true" />
            </div>
            {error && <div className="bd-wt-error-detail bd-wts__error">{error}</div>}
            <div className="bd-wts__rows">{rows}</div>
          </div>
        );
      });

  const pruneDialog = (
    <WorktreePruneDialog
      isOpen={pruneOpen}
      onClose={closePrune}
      repos={favorites.repos}
      prStatusKnown={isSection || prStatusKnown}
    />
  );

  if (isSection) {
    return (
      <div
        ref={rootRef}
        className="bd-wts"
        data-worktrees-ready={loading ? undefined : 'true'}
        onKeyDown={handleKeyDown}
      >
        <header className="bd-wb-head bd-wts__head">
          <h1 className="bd-wb-head__title">Worktrees</h1>
          <span
            className="bd-wts__count"
            aria-label={`${filtered.length} of ${totalCount} worktrees`}
          >
            {filtered.length}
          </span>
          <label className="bd-wb-head__search">
            <Search
              size={13}
              strokeWidth={2}
              aria-hidden="true"
              className="bd-wb-head__search-icon"
            />
            {searchInput}
            <Kbd>{shortcutLabel('K')}</Kbd>
          </label>
          <div className="bd-wts__head-actions">
            {favoritesOnlyButton}
            <Button
              variant="secondary"
              size="sm"
              leading={<Scissors size={12} strokeWidth={2.25} aria-hidden="true" />}
              onClick={() => setPruneOpen(true)}
            >
              Prune
            </Button>
            {refreshButton}
            <IconButton
              size={26}
              tooltip="Open worktrees window (Ctrl+F7)"
              aria-label="Open worktrees window"
              onClick={() =>
                void invoke('open_tool_window', { tool: 'worktrees' }).catch((err) =>
                  log.error('open_tool_window(worktrees) failed', err),
                )
              }
              icon={<AppWindow size={13} strokeWidth={2.25} />}
            />
          </div>
        </header>
        <div className="bd-wts__body" data-open={aside ? 'true' : undefined}>
          <div ref={listRef} className="bd-wts__list" aria-label="Worktrees">
            {emptyStates}
            {groups}
          </div>
          {aside}
        </div>
        {pruneDialog}
      </div>
    );
  }

  return (
    // `data-app-ready` flips to true once the initial worktree scan
    // resolves (success or failure). Playwright waits on this before
    // exercising the palette.
    <div
      ref={rootRef}
      className="bd-wt-palette"
      data-app-ready={loading ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      {header}

      <div className="bd-wt-toolbar">
        <div className="bd-wt-search-wrap">
          <Search className="bd-wt-search-icon" size={13} strokeWidth={2.4} aria-hidden />
          {searchInput}
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
            className="bd-wts__count bd-wt-count"
            aria-label={`${filtered.length} of ${totalCount} worktrees`}
          >
            {filtered.length}
          </span>
          {favoritesOnlyButton}
          <IconButton
            size={26}
            tooltip="Prune worktrees"
            aria-label="Prune worktrees"
            onClick={() => setPruneOpen(true)}
            icon={<Scissors size={13} strokeWidth={2.25} />}
          />
          {refreshButton}
        </div>
      </div>

      <div ref={listRef} className="bd-wt-content">
        {emptyStates}
        {groups}
      </div>

      {renderStatus?.({ shown: filtered.length, total: totalCount, favoritesOnly })}
      {pruneDialog}
    </div>
  );
}
