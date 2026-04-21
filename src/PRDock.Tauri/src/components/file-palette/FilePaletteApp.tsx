import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { parseQuery, type ParsedQuery } from './parse-query';
import { buildRootEntries, RootsColumn, type RootEntry } from './RootsColumn';
import { SearchPane } from './SearchPane';
import { ResultsList, type ResultEntry } from './ResultsList';
import { useFileIndex } from './use-file-index';

interface WorktreeEntry { path: string; branchName: string; isMainWorktree: boolean; }

export function FilePaletteApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [worktreePathsByRepo, setWorktreePathsByRepo] = useState<Record<string, string[]>>({});
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rowRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  const fileIndex = useFileIndex(activeRoot);
  const parsed: ParsedQuery = useMemo(() => parseQuery(query), [query]);

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
    if (!activeRoot && roots.length > 0) setActiveRoot(roots[0]!.path);
    else if (activeRoot && !roots.some((r) => r.path === activeRoot) && roots.length > 0) {
      setActiveRoot(roots[0]!.path);
    }
  }, [roots, activeRoot]);

  useEffect(() => setSelectedIndex(0), [query, activeRoot]);

  const selectRoot = useCallback(async (path: string) => {
    setActiveRoot(path);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteActiveRootPath: path } },
      });
    } catch { /* ignore */ }
  }, []);

  const results: ResultEntry[] = useMemo(() => {
    if (parsed.mode !== 'filename') return [];
    return fileIndex.filter(parsed.query).slice(0, 500).map((e) => ({
      rel_path: e.rel_path,
      mode: 'filename' as const,
    }));
  }, [parsed, fileIndex]);

  const openResult = useCallback((_i: number) => {
    // Will be wired in Task 19 (Enter-to-pop-out).
  }, []);

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
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) openResult(selectedIndex);
      }
    },
    [query, results, selectedIndex, openResult],
  );

  useEffect(() => {
    rowRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <RootsColumn roots={roots} activePath={activeRoot} onSelect={selectRoot} />
        <div className="fp-middle">
          <SearchPane
            query={query}
            onQueryChange={setQuery}
            parsed={parsed}
            resultCount={results.length}
          />
          {loadError ? (
            <div className="fp-empty">Load error: {loadError}</div>
          ) : fileIndex.loading && parsed.mode === 'filename' ? (
            <div className="fp-empty">Loading file index…</div>
          ) : (
            <ResultsList
              results={results}
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              onOpen={openResult}
              rowRef={(el, i) => {
                rowRefs.current.set(i, el);
              }}
            />
          )}
        </div>
        <div className="fp-preview-placeholder">Preview</div>
      </div>
    </div>
  );
}
