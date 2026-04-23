import { invoke } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@/styles/worktree-palette.css';
import type { AppSettings, RepoSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';

// Minimum window height so a small worktree list doesn't leave a cramped window.
const MIN_PALETTE_HEIGHT = 420;
// Margin below the window so it doesn't overlap the OS taskbar / dock.
const MONITOR_BOTTOM_MARGIN = 60;

// ── Types ────────────────────────────────────────────────────────────

interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

interface FlatEntry {
  wt: WorktreeEntry;
  repo: RepoSettings;
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
      className={`wt-row${isSelected ? ' wt-row--selected' : ''}${isMain ? ' wt-row--main' : ''}`}
      onClick={onOpenTerminal}
      onMouseEnter={onSelect}
    >
      {isMain ? (
        <span className="wt-star-placeholder" aria-hidden />
      ) : (
        <button
          className={`wt-star-btn${isFavorite ? ' wt-star-btn--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorite ? 'Unmark as favorite' : 'Mark as favorite'}
          aria-pressed={isFavorite}
        >
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
        </button>
      )}
      <div className="wt-row-body">
        <div className="wt-row-primary">
          <span className={`wt-branch${hasBranch ? '' : ' wt-branch--detached'}`}>
            {hasBranch ? wt.branchName : '(detached)'}
          </span>
          {isMain && <span className="wt-main-badge">main</span>}
        </div>
        <div className="wt-row-secondary">
          <span className="wt-folder">{folder}</span>
          {parent && (
            <span className="wt-parent" title={parent}>
              {parent}
            </span>
          )}
        </div>
      </div>
      <div className="wt-row-actions">
        <button
          className="wt-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTerminal();
          }}
          title="Open terminal here"
        >
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
        </button>
        <button
          className="wt-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFolder();
          }}
          title="Open folder"
        >
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
        </button>
        <button
          className="wt-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenEditor();
          }}
          title="Open in editor"
        >
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
        </button>
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

  // ── Data fetching ──
  const loadWorktrees = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      const repos = settings.repos.filter((r) => r.enabled && r.worktreeBasePath);
      const flat: FlatEntry[] = [];
      const errs = new Map<string, string>();
      const favs = new Set<string>();
      for (const r of settings.repos) {
        for (const p of r.favoriteWorktreePaths ?? []) favs.add(p);
      }

      await Promise.allSettled(
        repos.map(async (repo) => {
          try {
            // Fast path: only fetch path + branch. No per-worktree status scanning.
            const worktrees = await invoke<WorktreeEntry[]>('list_worktrees_bare', {
              basePath: repo.worktreeBasePath,
            });
            for (const wt of worktrees) {
              flat.push({ wt, repo });
            }
          } catch (err) {
            errs.set(`${repo.owner}/${repo.name}`, parseError(err).message);
          }
        }),
      );

      setAllEntries(flat);
      setFavoritePaths(favs);
      setFavoritesOnly(settings.ui?.worktreePaletteFavoritesOnly ?? false);
      setErrors(errs);
    } catch {
      // Settings load failed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Auto-focus search after load
  useEffect(() => {
    if (!loading) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [loading]);

  // Auto-resize window to fit the worktree list, capped at the monitor height.
  // Re-runs when the number of loaded worktrees or the favorites-only filter changes,
  // but intentionally NOT on every keystroke of the search query (would feel janky).
  useEffect(() => {
    // Reference the visible-count signals so biome treats them as real deps;
    // they are triggers, not values consumed inside the callback body.
    void allEntries.length;
    void favoritesOnly;
    if (loading) return;
    let cancelled = false;

    const resize = async () => {
      // Wait for layout to paint the new rows.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;

      try {
        const contentEl = document.querySelector('.wt-content') as HTMLElement | null;
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
          // Content is taller than visible — grow to fit, capped by the monitor.
          targetH = Math.min(currentLogicalH + overflow, maxLogicalH);
        } else if (overflow < -24) {
          // Meaningful empty space — shrink, but never below the minimum.
          targetH = Math.max(currentLogicalH + overflow, MIN_PALETTE_HEIGHT);
        } else {
          return;
        }

        // Skip micro-adjustments that would just thrash the window.
        if (Math.abs(targetH - currentLogicalH) < 4) return;

        await win.setSize(new LogicalSize(currentLogicalW, targetH));
      } catch (err) {
        // Ignore: tests don't mock these APIs, and on failure we fall back to the
        // initial window size which is still usable (scrollable).
        console.debug('Palette auto-resize failed:', err);
      }
    };

    resize();
    return () => {
      cancelled = true;
    };
  }, [loading, allEntries.length, favoritesOnly]);

  // ── Filtered + sorted + grouped data ──
  const filtered = useMemo(() => {
    const isFav = (e: FlatEntry) => favoritePaths.has(e.wt.path);
    const visible = allEntries.filter((e) => {
      if (!matchesQuery(e, query)) return false;
      // Main worktree is the repo anchor — always visible, even in favorites-only mode.
      if (favoritesOnly && !isFav(e) && !e.wt.isMainWorktree) return false;
      return true;
    });
    // Sort within each repo: main first, then favorites, then everything else by branch.
    visible.sort((a, b) => {
      const repoCmp = `${a.repo.owner}/${a.repo.name}`.localeCompare(
        `${b.repo.owner}/${b.repo.name}`,
      );
      if (repoCmp !== 0) return repoCmp;
      const mainCmp = Number(b.wt.isMainWorktree) - Number(a.wt.isMainWorktree);
      if (mainCmp !== 0) return mainCmp;
      const favCmp = Number(isFav(b)) - Number(isFav(a));
      if (favCmp !== 0) return favCmp;
      return a.wt.branchName.localeCompare(b.wt.branchName);
    });
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
    openPath(path).catch(console.debug); /* fire-and-forget */
  }, []);

  const handleOpenEditor = useCallback((path: string) => {
    invoke('open_in_editor', { path }).catch(console.debug); /* fire-and-forget */
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadWorktrees();
  }, [loadWorktrees]);

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
            getCurrentWindow().close();
          }
          break;
      }
    },
    [filtered, selectedIndex, query, handleOpenTerminal],
  );

  // ── Render ──
  let flatIndex = 0;

  return (
    <div className="wt-palette" onKeyDown={handleKeyDown}>
      {/* Titlebar */}
      <div className="wt-titlebar" data-tauri-drag-region>
        <div className="wt-titlebar-left">
          <div className="wt-logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 2v12M12 8c0-3-2-4-4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="4" cy="14" r="1.6" fill="currentColor" />
              <circle cx="4" cy="2" r="1.6" fill="currentColor" />
              <circle cx="12" cy="8" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <span className="wt-title">WORKTREES</span>
          <span className="wt-count">{filtered.length}</span>
        </div>
        <div className="wt-titlebar-right">
          <button
            className={`wt-btn-icon${favoritesOnly ? ' wt-btn-icon--active' : ''}`}
            onClick={handleToggleFavoritesOnly}
            title={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
            aria-pressed={favoritesOnly}
          >
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
          </button>
          <button
            className={`wt-btn-icon${refreshing ? ' wt-spin' : ''}`}
            onClick={handleRefresh}
            title="Refresh"
          >
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
              <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" />
              <path d="M12.5 1v3.5H9M3.5 15v-3.5H7" />
            </svg>
          </button>
          <button
            className="wt-btn-icon"
            onClick={() => getCurrentWindow().close()}
            title="Close (Esc)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="wt-search-wrap">
        <svg
          className="wt-search-icon"
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          ref={searchRef}
          className="wt-search"
          placeholder="Filter by branch, folder, or repo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        {query && (
          <button
            className="wt-search-clear"
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

      {/* Content */}
      <div className="wt-content">
        {loading && (
          <div className="wt-loading">
            <span className="wt-spinner" />
            <span>Scanning worktrees...</span>
          </div>
        )}

        {!loading && allEntries.length === 0 && errors.size === 0 && (
          <div className="wt-empty">
            <span className="wt-empty-title">No worktrees configured</span>
            <span className="wt-empty-detail">
              Set a worktree base path under Settings &rarr; Repos
            </span>
          </div>
        )}

        {!loading && allEntries.length > 0 && filtered.length === 0 && query && (
          <div className="wt-empty">
            <span className="wt-empty-title">
              No worktrees matching &lsquo;<strong>{query}</strong>&rsquo;
            </span>
          </div>
        )}

        {!loading && allEntries.length > 0 && filtered.length === 0 && !query && favoritesOnly && (
          <div className="wt-empty">
            <span className="wt-empty-title">No favorite worktrees</span>
            <span className="wt-empty-detail">
              Click the star on any worktree to mark it as a favorite
            </span>
          </div>
        )}

        {!loading &&
          [...grouped.entries()].map(([repoKey, entries]) => (
            <div key={repoKey} className="wt-group">
              <div className="wt-group-header">
                <span className="wt-group-name">{repoKey}</span>
                <span className="wt-group-count">{entries.length}</span>
                {errors.has(repoKey) && <span className="wt-group-error">error</span>}
              </div>
              {errors.has(repoKey) && <div className="wt-error-detail">{errors.get(repoKey)}</div>}
              <div className="wt-list">
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
          ))}
      </div>

      {/* Footer */}
      <div className="wt-footer">
        <span className="wt-hint">
          <kbd className="wt-kbd">{'\u2191\u2193'}</kbd>
          navigate
        </span>
        <span className="wt-sep">{'\u00B7'}</span>
        <span className="wt-hint">
          <kbd className="wt-kbd">{'\u23CE'}</kbd>
          open
        </span>
        <span className="wt-sep">{'\u00B7'}</span>
        <span className="wt-hint">
          <kbd className="wt-kbd">esc</kbd>
          close
        </span>
      </div>
    </div>
  );
}
