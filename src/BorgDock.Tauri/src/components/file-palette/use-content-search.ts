import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';

export interface ContentMatch {
  line: number;
  preview: string;
}

export interface ContentFileResult {
  rel_path: string;
  match_count: number;
  matches: ContentMatch[];
}

const DEBOUNCE_MS = 180;

export function useContentSearch(root: string | null, query: string) {
  const [results, setResults] = useState<ContentFileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!root) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (!query) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const token = ++tokenRef.current;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      invoke<ContentFileResult[]>('search_content', {
        root,
        pattern: query,
        cancelToken: token,
      })
        .then((r) => {
          if (token !== tokenRef.current) return;
          setResults(r);
        })
        .catch((e) => {
          if (token !== tokenRef.current) return;
          setError(String(e));
          setResults([]);
        })
        .finally(() => {
          if (token === tokenRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [root, query]);

  return { results, loading, error };
}
