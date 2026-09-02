import { invoke } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { IconButton, Kbd, Pill } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import type { AppSettings } from '@/types/settings';
import {
  WORKTREES_UPDATED_EVENT,
  type WorktreeCacheRepo,
  type WorktreeEntry,
  type WorktreeSnapshot,
} from '@/types/worktree';

// Minimum window height so a small worktree list doesn't leave a cramped window.
const MIN_PALETTE_HEIGHT = 420;
// Margin below the window so it doesn't overlap the OS taskbar / dock.
const MONITOR_BOTTOM_MARGIN = 60;

// ── Types ────────────────────────────────────────────────────────────

type RepoRef = WorktreeCacheRepo['repo'];

interface FlatEntry {
  wt: WorktreeEntry;
  repo: RepoRef;
}

// ── Helpers ──────────────────────────────────────────────────────────

function folderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? fullPath;
}

function parentFolder(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
}

function matchesQuery(entry: FlatEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const folder = folderName(entry.wt.path).toLowerCase();
  const branch = entry.wt.branchName.toLowerCase();
  const repo = `${entry.repo.owner}/${entry.repo.name}`.toLowerCase();
  return branch.includes(lower) || folder.includes(lower) || repo.includes(lower);
}

/** Numeric-aware, case-insensitive: worktree2 < worktree10, Foo ~ foo. */
export function compareFolderNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Palette order: repo → main worktree pinned first → folder name (numeric).
 * Favorites are marked with a star but deliberately NOT hoisted — a stable
 * folder order is what makes "worktree7" findable at a glance.
 */
export function compareFlatEntries(a: FlatEntry, b: FlatEntry): number {
  const repoCmp = `${a.repo.owner}/${a.repo.name}`.localeCompare(`${b.repo.owner}/${b.repo.name}`);
  if (repoCmp !== 0) return repoCmp;
  const mainCmp = Number(b.wt.isMainWorktree) - Number(a.wt.isMainWorktree);
  if (mainCmp !== 0) return mainCmp;
  return compareFolderNames(folderName(a.wt.path), folderName(b.wt.path));
}

/** Flatten a cache snapshot into palette rows + per-repo error map. */
export function flattenSnapshot(snapshot: WorktreeSnapshot): {
  entries: FlatEntry[];
  errors: Map<string, string>;
} {
  const entries: FlatEntry[] = [];
  const errors = new Map<string, string>();
  for (const repo of snapshot) {
    for (const wt of repo.entries) entries.push({ wt, repo: repo.repo });
    if (repo.error) errors.set(`${repo.repo.owner}/${repo.repo.name}`, repo.error);
  }
  return { entries, errors };
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function groupByRepo(entries: FlatEntry[]): Map<string, FlatEntry[]> {
  const groups = new Map<string, FlatEntry[]>();
  for (const e of entries) {
    const key = `${e.repo.owner}/${e.repo.name}`;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

// ── Sub-components ───────────────────────────────────────────────────

function WorktreeRow({
  entry,
  isSelected,
  isFavorite,
  onSelect,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
  onToggleFavorite,
  rowRef,
}: {
  entry: FlatEntry;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onOpenEditor: () => void;
  onToggleFavorite: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const { wt } = entry;
  const hasBranch = wt.branchName.length > 0;
  const folder = folderName(wt.path);
  const parent = parentFolder(wt.path);
  const isMain = wt.isMainWorktree;

  return (
    <div
      ref={rowRef}
      data-palette-row
      data-worktree-row
      data-tree-path={wt.path}
      className={clsx(
        'bd-wt-row',
        isSelected && 'bd-wt-row--selected',
        isMain && 'bd-wt-row--main',
      )}
      role="button"
      tabIndex={0}
      onClick={onOpenTerminal}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenTerminal();
        }
      }}
      onMouseEnter={onSelect}
    >
      {isMain ? (
        <span className="bd-wt-main-icon" aria-hidden>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 2v12M12 8c0-3-2-4-4-4" />
            <circle cx="4" cy="14" r="1.6" fill="currentColor" />
            <circle cx="4" cy="2" r="1.6" fill="currentColor" />
            <circle cx="12" cy="8" r="1.6" fill="currentColor" />
          </svg>
        </span>
      ) : (
        <IconButton
          size={22}
          active={isFavorite}
          tooltip={isFavorite ? 'Unmark as favorite' : 'Mark as favorite'}
          aria-pressed={isFavorite}
          className="bd-wt-star-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          icon={
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill={isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
            </svg>
          }
        />
      )}
      <div className="bd-wt-row-body">
        <div className="bd-wt-row-primary">
          <span className={clsx('bd-wt-branch', !hasBranch && 'bd-wt-branch--detached')}>
            {hasBranch ? wt.branchName : '(detached)'}
          </span>
          {isMain && (
            <Pill tone="success" className="text-[9px] uppercase tracking-wider">
              main
            </Pill>
          )}
        </div>
        <div className="bd-wt-row-secondary">
          <span className="bd-wt-folder">{folder}</span>
          {parent && (
            <span className="bd-wt-parent" title={parent}>
              {parent}
            </span>
          )}
        </div>
      </div>
      <div className="bd-wt-row-actions">
        <IconButton
          size={26}
          tooltip="Open terminal here"
          data-action="open-terminal"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTerminal();
          }}
          icon={
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 5l4 3-4 3" />
              <path d="M9 12h4" />
            </svg>
          }
        />
        <IconButton
          size={26}
          tooltip="Open folder"
          data-action="open-folder"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFolder();
          }}
          icon={
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3A1 1 0 002 4.5z" />
            </svg>
          }
        />
        <IconButton
          size={26}
          tooltip="Open in editor"
          data-action="open-editor"
          onClick={(e) => {
            e.stopPropagation();
            onOpenEditor();
          }}
          icon={
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
              <path d="M9.5 3.5l3 3" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function WorktreePaletteApp() {
  const [allEntries, setAllEntries] = useState<FlatEntry[]>([]);
  const [favoritePaths, setFavoritePaths] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // ── Data: two-phase (cache snapshot → background revalidate) ──
  const applySnapshot = useCallback((snapshot: WorktreeSnapshot) => {
    const { entries, errors: errs } = flattenSnapshot(snapshot);
    setAllEntries(entries);
    setErrors(errs);
  }, []);

  // Favorites + the favorites-only flag live in settings. Loaded in parallel
  // with the worktree snapshot; only gates the star, never the list.
  const loadFavorites = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      const favs = new Set<string>();
      for (const r of settings.repos) {
        for (const p of r.favoriteWorktreePaths ?? []) favs.add(p);
      }
      setFavoritePaths(favs);
      setFavoritesOnly(settings.ui?.worktreePaletteFavoritesOnly ?? false);
    } catch {
      // Settings load failed — stars stay empty, list still renders.
    }
  }, []);

  // Ask Rust to rescan every repo. Never clears the current list; the fresh
  // snapshot replaces it when it lands (also broadcast as `worktrees-updated`).
  const refreshWorktrees = useCallback(async () => {
    setRefreshing(true);
    try {
      const snapshot = await invoke<WorktreeSnapshot>('worktree_cache_refresh');
      applySnapshot(snapshot);
    } catch {
      // Keep showing the cached rows; per-repo errors arrive via the snapshot.
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot]);

  // Grow the window to fit the list (capped by the monitor) — only ever
  // called BEFORE `window_ready`, so the user never sees the resize jump.
  // The palette spec is fixed-size for the user; this is the one programmatic
  // adjustment, done while the window is still invisible.
  const fitWindowToContent = useCallback(async () => {
    try {
      const contentEl = document.querySelector('.bd-wt-content') as HTMLElement | null;
      if (!contentEl) return;

      const win = getCurrentWindow();
      const [physSize, scale, monitor] = await Promise.all([
        win.innerSize(),
        win.scaleFactor(),
        currentMonitor(),
      ]);

      const currentLogicalW = physSize.width / scale;
      const currentLogicalH = physSize.height / scale;

      const overflow = contentEl.scrollHeight - contentEl.clientHeight;
      const maxLogicalH = (monitor ? monitor.size.height / scale : 900) - MONITOR_BOTTOM_MARGIN;

      let targetH: number;
      if (overflow > 0) {
        targetH = Math.min(currentLogicalH + overflow, maxLogicalH);
      } else if (overflow < -24) {
        targetH = Math.max(currentLogicalH + overflow, MIN_PALETTE_HEIGHT);
      } else {
        return;
      }
      if (Math.abs(targetH - currentLogicalH) < 4) return;

      await win.setSize(new LogicalSize(currentLogicalW, targetH));
    } catch (err) {
      // Tests don't mock these APIs; on failure the default size still
      // works (the list scrolls).
      console.debug('Palette fit-to-content failed:', err);
    }
  }, []);

  // Mount: render the cached snapshot immediately, reveal the window on the
  // next paint (skeleton if the cache is cold), then revalidate in the
  // background. Settings (favorites) load in parallel and never gate reveal.
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

    loadFavorites();

    (async () => {
      // Give the instant snapshot IPC a moment so the first paint (and the
      // one-time fit) include cached rows — but never wait on it for long:
      // reveal is "on mount", not "after data".
      await Promise.race([snapshotReady, new Promise((r) => setTimeout(r, 100))]);
      if (cancelled || revealedRef.current) return;
      await nextFrame();
      if (cancelled || revealedRef.current) return;
      revealedRef.current = true;
      await fitWindowToContent();
      searchRef.current?.focus();
      invoke('window_ready').catch(() => {});
      // Background revalidation after reveal.
      refreshWorktrees();
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, loadFavorites, fitWindowToContent, refreshWorktrees]);

  // Any refresh anywhere (startup prefetch, create/remove worktree in the
  // main window, palette refresh) broadcasts the new snapshot.
  useEffect(() => {
    const unlisten = listen<WorktreeSnapshot>(WORKTREES_UPDATED_EVENT, (event) => {
      applySnapshot(event.payload);
      setLoading(false);
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [applySnapshot]);

  // The window is hidden (not destroyed) on Escape / close button, so on
  // each re-show the Rust toggle emits `palette-shown`. Reset query +
  // selection, revalidate in the background (list stays), refocus the input.
  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      setQuery('');
      setSelectedIndex(0);
      refreshWorktrees();
      loadFavorites();
      requestAnimationFrame(() => searchRef.current?.focus());
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [refreshWorktrees, loadFavorites]);

  // ── Filtered + sorted + grouped data ──
  const filtered = useMemo(() => {
    const isFav = (e: FlatEntry) => favoritePaths.has(e.wt.path);
    const visible = allEntries.filter((e) => {
      if (!matchesQuery(e, query)) return false;
      // Main worktree is the repo anchor — always visible, even in favorites-only mode.
      if (favoritesOnly && !isFav(e) && !e.wt.isMainWorktree) return false;
      return true;
    });
    // Sort within each repo: main first, then folder name (numeric-aware).
    // Favorites keep their place — they're marked, not hoisted.
    visible.sort(compareFlatEntries);
    return visible;
  }, [allEntries, query, favoritePaths, favoritesOnly]);

  const grouped = useMemo(() => groupByRepo(filtered), [filtered]);

  // Reset selection when query changes
  useEffect(() => {
    // `query` is the trigger — we just need to fire when it changes.
    void query;
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const el = rowRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Actions ──
  const handleOpenTerminal = useCallback((path: string) => {
    invoke('open_in_terminal', { path }).catch(console.debug); /* fire-and-forget */
  }, []);

  const handleOpenFolder = useCallback((path: string) => {
    invoke('reveal_in_file_manager', { path }).catch(console.debug); /* fire-and-forget */
  }, []);

  const handleOpenEditor = useCallback((path: string) => {
    invoke('open_in_editor', { path }).catch(console.debug); /* fire-and-forget */
  }, []);

  const handleRefresh = useCallback(() => {
    refreshWorktrees();
  }, [refreshWorktrees]);

  const handleToggleFavorite = useCallback(
    async (entry: FlatEntry) => {
      const path = entry.wt.path;
      const wasFav = favoritePaths.has(path);

      // Optimistic local update
      setFavoritePaths((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(path);
        else next.add(path);
        return next;
      });

      try {
        const settings = await invoke<AppSettings>('load_settings');
        const updatedRepos = settings.repos.map((r) => {
          if (r.owner !== entry.repo.owner || r.name !== entry.repo.name) return r;
          const existing = r.favoriteWorktreePaths ?? [];
          const favoriteWorktreePaths = wasFav
            ? existing.filter((p) => p !== path)
            : existing.includes(path)
              ? existing
              : [...existing, path];
          return { ...r, favoriteWorktreePaths };
        });
        await invoke('save_settings', { settings: { ...settings, repos: updatedRepos } });
      } catch {
        // Roll back on failure
        setFavoritePaths((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(path);
          else next.delete(path);
          return next;
        });
      }
    },
    [favoritePaths],
  );

  const handleToggleFavoritesOnly = useCallback(async () => {
    const next = !favoritesOnly;
    setFavoritesOnly(next);
    try {
      const settings = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: {
          ...settings,
          ui: { ...settings.ui, worktreePaletteFavoritesOnly: next },
        },
      });
    } catch {
      setFavoritesOnly(!next); // roll back
    }
  }, [favoritesOnly]);

  // ── Keyboard ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            handleOpenTerminal(filtered[selectedIndex].wt.path);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (query) {
            setQuery('');
          } else {
            // Hide rather than close: the WebView2 stays alive across opens
            // so in-flight IPC responses don't PostMessage a dead HWND.
            getCurrentWindow().hide();
          }
          break;
      }
    },
    [filtered, selectedIndex, query, handleOpenTerminal],
  );

  // ── Render ──
  let flatIndex = 0;

  const totalCount = allEntries.length;

  return (
    // `data-app-ready` flips to true once the initial worktree scan
    // resolves (success or failure). Playwright waits on this before
    // exercising the palette.
    <div
      className="bd-wt-palette"
      data-app-ready={loading ? undefined : 'true'}
      onKeyDown={handleKeyDown}
    >
      <WindowTitleBar title="Worktrees" meta={<Kbd>Ctrl+F7</Kbd>} />

      <div className="bd-wt-toolbar">
        <div className="bd-wt-search-wrap">
          <svg
            className="bd-wt-search-icon"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            className="bd-input bd-wt-search"
            aria-label="Filter worktrees"
            placeholder="Filter by branch, folder, or repo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          {query && (
            <button
              type="button"
              className="bd-wt-search-clear"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              title="Clear"
            >
              {'\u2715'}
            </button>
          )}
        </div>
        <div className="bd-wt-toolbar-actions">
          <Pill tone="ghost">{filtered.length}</Pill>
          <IconButton
            size={26}
            active={favoritesOnly}
            tooltip={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
            aria-pressed={favoritesOnly}
            onClick={handleToggleFavoritesOnly}
            icon={
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill={favoritesOnly ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
              </svg>
            }
          />
          <IconButton
            size={26}
            tooltip="Refresh"
            onClick={handleRefresh}
            icon={
              <svg
                className={refreshing ? 'animate-spin' : undefined}
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" />
                <path d="M12.5 1v3.5H9M3.5 15v-3.5H7" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Content */}
      <div className="bd-wt-content">
        {(loading || (refreshing && allEntries.length === 0 && errors.size === 0)) && (
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
          [...new Set([...grouped.keys(), ...errors.keys()])].map((repoKey) => {
            const entries = grouped.get(repoKey) ?? [];
            return (
              <div key={repoKey} className="bd-wt-group">
                <div className="bd-wt-group-header">
                  <span className="bd-wt-group-name">{repoKey}</span>
                  <Pill tone="ghost">{entries.length}</Pill>
                  {errors.has(repoKey) && <Pill tone="error">error</Pill>}
                </div>
                {errors.has(repoKey) && (
                  <div className="bd-wt-error-detail">{errors.get(repoKey)}</div>
                )}
                <div className="bd-wt-list">
                  {entries.map((entry) => {
                    const idx = flatIndex++;
                    return (
                      <WorktreeRow
                        key={entry.wt.path}
                        entry={entry}
                        isSelected={idx === selectedIndex}
                        isFavorite={favoritePaths.has(entry.wt.path)}
                        onSelect={() => setSelectedIndex(idx)}
                        onOpenTerminal={() => handleOpenTerminal(entry.wt.path)}
                        onOpenFolder={() => handleOpenFolder(entry.wt.path)}
                        onOpenEditor={() => handleOpenEditor(entry.wt.path)}
                        onToggleFavorite={() => handleToggleFavorite(entry)}
                        rowRef={(el) => {
                          rowRefs.current.set(idx, el);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      <WindowStatusBar
        left={
          <span className="bd-mono">
            {filtered.length} of {totalCount} worktree{totalCount === 1 ? '' : 's'}
            {favoritesOnly && ' \u00B7 favorites only'}
          </span>
        }
        right={
          <span className="bd-mono">
            <Kbd>{'\u2191\u2193'}</Kbd> nav {'\u00B7'} <Kbd>{'\u23CE'}</Kbd> open {'\u00B7'}{' '}
            <Kbd>esc</Kbd>
          </span>
        }
      />
    </div>
  );
}
