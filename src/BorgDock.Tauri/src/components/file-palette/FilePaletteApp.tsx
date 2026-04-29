import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { joinRootAndRel } from './join-path';
import { parseQuery, type ParsedQuery } from './parse-query';
import { buildRootEntries, FilePaletteRootsColumn, type RootEntry } from './FilePaletteRootsColumn';
import { FilePalettePreviewPane } from './FilePalettePreviewPane';
import { FilePaletteSearchPane } from './FilePaletteSearchPane';
import { FilePaletteResultsList, type ResultEntry } from './FilePaletteResultsList';
import { useBackgroundIndexer } from './use-background-indexer';
import { useContentSearch } from './use-content-search';
import { useFileIndex } from './use-file-index';
import { mergeSymbolHits } from './use-symbol-index';
import { FilePaletteChangesSection, type ChangedGroup, type VisibleRow } from './FilePaletteChangesSection';

interface WorktreeEntry { path: string; branchName: string; isMainWorktree: boolean; }

export function FilePaletteApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [worktreePathsByRepo, setWorktreePathsByRepo] = useState<Record<string, string[]>>({});
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favoritePaths, setFavoritePaths] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [rootsCollapsed, setRootsCollapsed] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState<{ local: boolean; vsBase: boolean }>({
    local: false,
    vsBase: false,
  });
  const [changesVisibleRows, setChangesVisibleRows] = useState<VisibleRow[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const rowRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  const fileIndex = useFileIndex(activeRoot);
  const indexer = useBackgroundIndexer(activeRoot, fileIndex.entries);
  const parsed: ParsedQuery = useMemo(() => parseQuery(query), [query]);

  const contentSearch = useContentSearch(
    parsed.mode === 'content' ? activeRoot : null,
    parsed.mode === 'content' ? parsed.query : '',
  );

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>('load_settings');
        setSettings(s);
        const repos = s.repos.filter((r) => r.enabled && r.worktreeBasePath);
        const collected: Record<string, string[]> = {};
        await Promise.allSettled(repos.map(async (r) => {
          try {
            const wts = await invoke<WorktreeEntry[]>('list_worktrees_bare', { basePath: r.worktreeBasePath });
            collected[`${r.owner}/${r.name}`] = wts.map((w) => w.path);
          } catch { collected[`${r.owner}/${r.name}`] = []; }
        }));
        setWorktreePathsByRepo(collected);
        setActiveRoot(s.ui?.filePaletteActiveRootPath ?? null);
        setFavoritesOnly(s.ui?.filePaletteFavoritesOnly ?? false);
        setRootsCollapsed(s.ui?.filePaletteRootsCollapsed ?? false);
        setChangesCollapsed(
          s.ui?.filePaletteChangesCollapsed ?? { local: false, vsBase: false },
        );
        const favs = new Set<string>();
        for (const r of s.repos) for (const p of r.favoriteWorktreePaths ?? []) favs.add(p);
        setFavoritePaths(favs);
      } catch (e) {
        setLoadError(parseError(e).message);
      }
    })();
  }, []);

  const roots: RootEntry[] = useMemo(() => {
    if (!settings) return [];
    return buildRootEntries(settings.repos, settings.filePaletteRoots, worktreePathsByRepo);
  }, [settings, worktreePathsByRepo]);

  useEffect(() => {
    if (roots.length === 0) return;
    // When the user has "favorites only" on, the default root must come from the
    // visible (favorite) set — otherwise the palette opens on a hidden worktree.
    const pickable = favoritesOnly
      ? roots.filter((r) => r.source !== 'worktree' || favoritePaths.has(r.path))
      : roots;
    const fallback = pickable[0] ?? roots[0]!;
    if (!activeRoot) {
      setActiveRoot(fallback.path);
    } else if (!roots.some((r) => r.path === activeRoot)) {
      setActiveRoot(fallback.path);
    }
  }, [roots, activeRoot, favoritesOnly, favoritePaths]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are reset triggers — selection should clear when query, root, or visible-rows count changes
  useEffect(() => setSelectedIndex(0), [query, activeRoot, changesVisibleRows.length]);

  const selectRoot = useCallback(async (path: string) => {
    setActiveRoot(path);
    setRootsCollapsed(true);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: {
          ...s,
          ui: {
            ...s.ui,
            filePaletteActiveRootPath: path,
            filePaletteRootsCollapsed: true,
          },
        },
      });
    } catch { /* ignore */ }
  }, []);

  const addCustomRoot = useCallback(async () => {
    let chosen: string | null;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({ directory: true, multiple: false });
      chosen = typeof result === 'string' ? result : null;
    } catch (e) {
      console.error('addCustomRoot: picker failed', e);
      return;
    }
    if (!chosen) return;

    const norm = chosen.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    const isDup = roots.some((r) => {
      const n = r.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
      return n === norm;
    });
    if (isDup) return;

    try {
      const s = await invoke<AppSettings>('load_settings');
      const next: AppSettings = {
        ...s,
        filePaletteRoots: [...(s.filePaletteRoots ?? []), { path: chosen }],
      };
      await invoke('save_settings', { settings: next });
      setSettings(next);
      await selectRoot(chosen);
    } catch (e) {
      console.error('addCustomRoot: save failed', e);
    }
  }, [roots, selectRoot]);

  const removeCustomRoot = useCallback(async (root: RootEntry) => {
    if (root.source !== 'custom') return;
    try {
      const s = await invoke<AppSettings>('load_settings');
      const next: AppSettings = {
        ...s,
        filePaletteRoots: (s.filePaletteRoots ?? []).filter((r) => r.path !== root.path),
      };
      await invoke('save_settings', { settings: next });
      setSettings(next);
    } catch (e) {
      console.error('removeCustomRoot: save failed', e);
    }
  }, []);

  const toggleRootsCollapsed = useCallback(async () => {
    const next = !rootsCollapsed;
    setRootsCollapsed(next);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteRootsCollapsed: next } },
      });
    } catch { /* ignore */ }
  }, [rootsCollapsed]);

  const toggleChangesCollapse = useCallback(
    async (group: ChangedGroup) => {
      setChangesCollapsed((prev) => {
        const next = { ...prev, [group]: !prev[group] };
        void invoke<AppSettings>('load_settings')
          .then((s) =>
            invoke('save_settings', {
              settings: { ...s, ui: { ...s.ui, filePaletteChangesCollapsed: next } },
            }),
          )
          .catch(() => {
            /* ignore persistence failure */
          });
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) setRefreshTick((n) => n + 1);
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const toggleFavoritesOnly = useCallback(async () => {
    const next = !favoritesOnly;
    setFavoritesOnly(next);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteFavoritesOnly: next } },
      });
    } catch {
      setFavoritesOnly(!next);
    }
  }, [favoritesOnly]);

  const toggleFavorite = useCallback(
    async (root: RootEntry) => {
      if (root.source !== 'worktree' || !root.repoOwner || !root.repoName) return;
      const wasFav = favoritePaths.has(root.path);
      setFavoritePaths((prev) => {
        const n = new Set(prev);
        if (wasFav) n.delete(root.path); else n.add(root.path);
        return n;
      });
      try {
        const s = await invoke<AppSettings>('load_settings');
        const updatedRepos = s.repos.map((r) => {
          if (r.owner !== root.repoOwner || r.name !== root.repoName) return r;
          const existing = r.favoriteWorktreePaths ?? [];
          const favoriteWorktreePaths = wasFav
            ? existing.filter((p) => p !== root.path)
            : existing.includes(root.path)
              ? existing
              : [...existing, root.path];
          return { ...r, favoriteWorktreePaths };
        });
        await invoke('save_settings', { settings: { ...s, repos: updatedRepos } });
      } catch {
        setFavoritePaths((prev) => {
          const n = new Set(prev);
          if (wasFav) n.add(root.path); else n.delete(root.path);
          return n;
        });
      }
    },
    [favoritePaths],
  );

  const results: ResultEntry[] = useMemo(() => {
    if (parsed.mode === 'filename') {
      return fileIndex
        .filter(parsed.query)
        .slice(0, 500)
        .map((e) => ({ rel_path: e.rel_path, mode: 'filename' as const }));
    }
    if (parsed.mode === 'content') {
      return contentSearch.results.map((r) => ({
        rel_path: r.rel_path,
        mode: 'content' as const,
        match_count: r.match_count,
        line: r.matches[0]?.line,
      }));
    }
    if (parsed.mode === 'symbol') {
      return mergeSymbolHits(indexer.entries, parsed.query)
        .slice(0, 200)
        .map((s) => ({
          rel_path: s.rel_path,
          mode: 'symbol' as const,
          line: s.line,
          symbol: s.name,
        }));
    }
    return [];
  }, [parsed, fileIndex, contentSearch.results, indexer.entries]);

  // selectedIndex is a flat-nav index: [0, changesVisibleRows.length) is Changes
  // rows; [changesVisibleRows.length, +results.length) is regular results. The
  // preview + contentHit logic below only applies when the selection is in the
  // results range — subtract the Changes offset first, otherwise we'd index into
  // the wrong list or read a stale cell.
  const resultsSelectedIndex = selectedIndex - changesVisibleRows.length;
  const selectedResult =
    resultsSelectedIndex >= 0 ? results[resultsSelectedIndex] ?? null : null;

  const currentContentHit = useMemo(() => {
    if (parsed.mode !== 'content' || !selectedResult) return null;
    const match = contentSearch.results.find((r) => r.rel_path === selectedResult.rel_path);
    return match ?? null;
  }, [parsed.mode, selectedResult, contentSearch.results]);

  const totalFlatLength = changesVisibleRows.length + results.length;

  const openResult = useCallback(
    (globalIdx: number) => {
      if (!activeRoot) return;
      if (globalIdx < changesVisibleRows.length) {
        const row = changesVisibleRows[globalIdx];
        if (!row) return;
        const absPath = joinRootAndRel(activeRoot, row.file.path);
        invoke('open_file_viewer_window', {
          path: absPath,
          baseline: row.group === 'vsBase' ? 'mergeBaseDefault' : 'HEAD',
        }).catch((e) => console.error('open_file_viewer_window failed', e));
        return;
      }
      const resultIdx = globalIdx - changesVisibleRows.length;
      const entry = results[resultIdx];
      if (!entry) return;
      const absPath = joinRootAndRel(activeRoot, entry.rel_path);
      invoke('open_file_viewer_window', { path: absPath }).catch((e) => {
        console.error('open_file_viewer_window failed', e);
      });
    },
    [activeRoot, changesVisibleRows, results],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) setQuery('');
        else getCurrentWindow().close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, totalFlatLength - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openResult(selectedIndex);
      }
    },
    [query, totalFlatLength, selectedIndex, openResult],
  );

  const jumpToSymbol = useCallback((word: string) => {
    setQuery(`@${word}`);
  }, []);

  useEffect(() => {
    rowRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div data-window="palette" className="bd-fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="bd-fp-titlebar" data-tauri-drag-region>
        <span className="bd-fp-title">FILES</span>
      </div>
      <div className={`bd-fp-body${rootsCollapsed ? ' bd-fp-body--collapsed' : ''}`}>
        <FilePaletteRootsColumn
          roots={roots}
          activePath={activeRoot}
          onSelect={selectRoot}
          favoritePaths={favoritePaths}
          onToggleFavorite={toggleFavorite}
          favoritesOnly={favoritesOnly}
          onToggleFavoritesOnly={toggleFavoritesOnly}
          collapsed={rootsCollapsed}
          onToggleCollapsed={toggleRootsCollapsed}
          onAddCustomRoot={addCustomRoot}
          onRemoveCustomRoot={removeCustomRoot}
        />
        <div className="bd-fp-middle">
          <FilePaletteSearchPane
            query={query}
            onQueryChange={setQuery}
            parsed={parsed}
            resultCount={results.length}
          />
          <FilePaletteChangesSection
            rootPath={activeRoot}
            query={query}
            queryMode={parsed.mode}
            selectedGlobalIndex={selectedIndex}
            baseIndex={0}
            onOpen={(file, group) => {
              if (!activeRoot) return;
              const absPath = joinRootAndRel(activeRoot, file.path);
              invoke('open_file_viewer_window', {
                path: absPath,
                baseline: group === 'vsBase' ? 'mergeBaseDefault' : 'HEAD',
              }).catch((e) => console.error('open_file_viewer_window failed', e));
            }}
            onHover={setSelectedIndex}
            localCollapsed={changesCollapsed.local}
            vsBaseCollapsed={changesCollapsed.vsBase}
            onToggleCollapse={toggleChangesCollapse}
            refreshTick={refreshTick}
            onVisibleRowsChange={setChangesVisibleRows}
            rowRef={(el, i) => { rowRefs.current.set(i, el); }}
          />
          {loadError ? (
            <div className="bd-fp-empty">Load error: {loadError}</div>
          ) : roots.length === 0 ? (
            <div className="bd-fp-empty">No roots configured. Add worktrees or paths under Settings.</div>
          ) : fileIndex.loading && parsed.mode === 'filename' ? (
            <div className="bd-fp-empty">Loading file index…</div>
          ) : parsed.mode === 'symbol' && indexer.indexing && results.length === 0 ? (
            <div className="bd-fp-empty">
              Indexing symbols… {indexer.processed} / {indexer.total}
            </div>
          ) : parsed.mode === 'content' && contentSearch.loading && results.length === 0 ? (
            <div className="bd-fp-empty">Searching…</div>
          ) : results.length === 0 && parsed.query ? (
            parsed.mode === 'filename' ? (
              <div className="bd-fp-empty">No filenames matching &lsquo;{parsed.query}&rsquo;.</div>
            ) : parsed.mode === 'content' ? (
              <div className="bd-fp-empty">No content matches for &lsquo;{parsed.query}&rsquo;.</div>
            ) : (
              <div className="bd-fp-empty">
                No implementations found for &lsquo;{parsed.query}&rsquo; in this root. v1 supports TS, JS, C#, Rust.
              </div>
            )
          ) : (
            <FilePaletteResultsList
              results={results}
              selectedIndex={selectedIndex - changesVisibleRows.length}
              onHover={(i) => setSelectedIndex(i + changesVisibleRows.length)}
              onOpen={(i) => openResult(i + changesVisibleRows.length)}
              rowRef={(el, i) => {
                rowRefs.current.set(i + changesVisibleRows.length, el);
              }}
            />
          )}
        </div>
        <FilePalettePreviewPane
          rootPath={activeRoot}
          relPath={selectedResult?.rel_path ?? null}
          scrollToLine={currentContentHit?.matches[0]?.line ?? selectedResult?.line}
          highlightedLines={currentContentHit?.matches.map((m) => m.line)}
          onIdentifierJump={jumpToSymbol}
        />
      </div>
    </div>
  );
}
