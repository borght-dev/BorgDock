import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

interface ChangedFileWire {
  path: string;
  status: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}

interface ChangedFilesOutputWire {
  local: ChangedFileWire[];
  vsBase: ChangedFileWire[];
  baseRef: string;
  inRepo: boolean;
}

export interface RootCount {
  count: number;
  addTotal: number;
  delTotal: number;
}

export interface UseWorktreeChangeCountsResult {
  counts: ReadonlyMap<string, RootCount>;
  refreshOne: (path: string) => void;
}

const sumStats = (files: ChangedFileWire[]) => ({
  count: files.length,
  addTotal: files.reduce((s, f) => s + (f.additions ?? 0), 0),
  delTotal: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
});

export function useWorktreeChangeCounts(
  rootPaths: readonly string[],
  refreshTick: number,
): UseWorktreeChangeCountsResult {
  const [counts, setCounts] = useState<Map<string, RootCount>>(new Map());

  const fetchOne = useCallback(async (path: string) => {
    try {
      const r = await invoke<ChangedFilesOutputWire>('git_changed_files', { root: path });
      if (!r.inRepo) {
        setCounts((prev) => {
          if (!prev.has(path)) return prev;
          const next = new Map(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      const stats = sumStats(r.local);
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(path, stats);
        return next;
      });
    } catch {
      setCounts((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rootPaths.join is the change signal — we don't want array identity to retrigger.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(
      rootPaths.map(async (p) => {
        if (cancelled) return;
        await fetchOne(p);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [rootPaths.join(' '), refreshTick, fetchOne]);

  const refreshOne = useCallback(
    (path: string) => {
      void fetchOne(path);
    },
    [fetchOne],
  );

  return { counts, refreshOne };
}
