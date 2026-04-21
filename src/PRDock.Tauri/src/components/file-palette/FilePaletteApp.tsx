import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { buildRootEntries, RootsColumn, type RootEntry } from './RootsColumn';

interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

export function FilePaletteApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [worktreePathsByRepo, setWorktreePathsByRepo] = useState<Record<string, string[]>>({});
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>('load_settings');
        setSettings(s);
        const repos = s.repos.filter((r) => r.enabled && r.worktreeBasePath);
        const collected: Record<string, string[]> = {};
        await Promise.allSettled(
          repos.map(async (r) => {
            try {
              const wts = await invoke<WorktreeEntry[]>('list_worktrees_bare', {
                basePath: r.worktreeBasePath,
              });
              collected[`${r.owner}/${r.name}`] = wts.map((w) => w.path);
            } catch {
              collected[`${r.owner}/${r.name}`] = [];
            }
          }),
        );
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
    if (!activeRoot && roots.length > 0) {
      setActiveRoot(roots[0]!.path);
    } else if (activeRoot && !roots.some((r) => r.path === activeRoot) && roots.length > 0) {
      setActiveRoot(roots[0]!.path);
    }
  }, [roots, activeRoot]);

  const selectRoot = useCallback(async (path: string) => {
    setActiveRoot(path);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteActiveRootPath: path } },
      });
    } catch {
      /* best effort */
    }
  }, []);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <RootsColumn roots={roots} activePath={activeRoot} onSelect={selectRoot} />
        <div className="fp-middle-placeholder">
          {loadError ? `Load error: ${loadError}` : 'Search coming online…'}
        </div>
        <div className="fp-preview-placeholder">Preview</div>
      </div>
    </div>
  );
}
