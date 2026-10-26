import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { indexSymbols } from '@/services/symbol-indexer';
import { joinRootAndRel } from './join-path';
import type { FileEntry } from './use-file-index';
import { languageForExtension, type SymbolEntry } from './use-symbol-index';

interface IndexerResult {
  entries: SymbolEntry[];
  processed: number;
  total: number;
  indexing: boolean;
}

export function useBackgroundIndexer(root: string | null, files: FileEntry[]): IndexerResult {
  const [result, setResult] = useState<IndexerResult>({
    entries: [],
    processed: 0,
    total: files.length,
    indexing: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    const indexable = root
      ? files.filter((file) => languageForExtension(file.rel_path.split('.').pop() ?? ''))
      : [];
    setResult({ entries: [], processed: 0, total: files.length, indexing: indexable.length > 0 });
    if (!root || indexable.length === 0) return () => controller.abort();
    void (async () => {
      const entries: SymbolEntry[] = [];
      let processed = 0;
      for (const file of indexable) {
        if (controller.signal.aborted) return;
        try {
          const content = await invoke<string>('read_text_file', {
            path: joinRootAndRel(root, file.rel_path),
          });
          if (controller.signal.aborted) return;
          for (const entry of await indexSymbols(file.rel_path, content, controller.signal))
            entries.push(entry);
        } catch {
          /* Unreadable files do not stop the rest of the index. */
        }
        if (controller.signal.aborted) return;
        processed++;
        if (processed % 20 === 0 || processed === indexable.length) {
          setResult({
            entries: [...entries],
            processed,
            total: files.length,
            indexing: processed < indexable.length,
          });
        }
      }
    })();
    return () => controller.abort();
  }, [root, files]);
  return result;
}
