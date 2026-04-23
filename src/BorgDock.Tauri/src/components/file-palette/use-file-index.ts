import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface FileEntry {
  rel_path: string;
  size: number;
}

interface ListFilesResult {
  entries: FileEntry[];
  truncated: boolean;
}

export interface FileIndexState {
  entries: FileEntry[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  filter: (query: string) => FileEntry[];
  refresh: () => Promise<void>;
}

export function useFileIndex(root: string | null, limit?: number): FileIndexState {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState<boolean>(Boolean(root));
  const [error, setError] = useState<string | null>(null);
  const currentRoot = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!root) {
      setEntries([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    currentRoot.current = root;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ListFilesResult>('list_root_files', { root, limit });
      if (currentRoot.current !== root) return; // a newer call took over
      setEntries(result.entries);
      setTruncated(result.truncated);
    } catch (e) {
      if (currentRoot.current !== root) return;
      setError(String(e));
      setEntries([]);
      setTruncated(false);
    } finally {
      if (currentRoot.current === root) setLoading(false);
    }
  }, [root, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const filter = useCallback(
    (query: string) => {
      if (!query) return entries;
      const lower = query.toLowerCase();
      return entries.filter((e) => e.rel_path.toLowerCase().includes(lower));
    },
    [entries],
  );

  return useMemo(
    () => ({ entries, truncated, loading, error, filter, refresh: load }),
    [entries, truncated, loading, error, filter, load],
  );
}
