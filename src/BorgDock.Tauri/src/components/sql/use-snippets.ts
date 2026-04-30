import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SqlSnippet } from './snippet-types';

/**
 * Snippet store backed by SQLite (`sql_snippets` table).
 *
 * In dev/tests where the Tauri host isn't available, localStorage acts as a
 * fallback so the UI still works. The fallback never silently masks a real
 * Tauri error — `invoke` failures just warn and degrade.
 */

const FALLBACK_STORAGE_KEY = 'borgdock.sql.snippets';

function newId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function isInTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/* ── localStorage fallback ──────────────────────────────── */

function readFallback(): SqlSnippet[] {
  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SqlSnippet =>
        s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.body === 'string',
    );
  } catch {
    return [];
  }
}

function writeFallback(list: SqlSnippet[]): void {
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / private-mode */
  }
}

/* ── Tauri commands ─────────────────────────────────────── */

async function listFromBackend(): Promise<SqlSnippet[]> {
  if (!isInTauri()) return readFallback();
  try {
    return await invoke<SqlSnippet[]>('sql_snippets_list');
  } catch (err) {
    console.warn('[sql-snippets] list failed, using local fallback:', err);
    return readFallback();
  }
}

async function saveToBackend(snippet: SqlSnippet): Promise<void> {
  if (!isInTauri()) return;
  try {
    await invoke('sql_snippets_save', { snippet });
  } catch (err) {
    console.warn('[sql-snippets] save failed:', err);
  }
}

async function deleteFromBackend(id: string): Promise<void> {
  if (!isInTauri()) return;
  try {
    await invoke('sql_snippets_delete', { id });
  } catch (err) {
    console.warn('[sql-snippets] delete failed:', err);
  }
}

/* ── Hook ───────────────────────────────────────────────── */

export interface UseSnippetsResult {
  snippets: SqlSnippet[];
  loading: boolean;
  add: (input: { name: string; body: string }) => SqlSnippet;
  update: (id: string, patch: Partial<Omit<SqlSnippet, 'id'>>) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => SqlSnippet | null;
  toggleStar: (id: string) => void;
  remove: (id: string) => void;
}

export function useSnippets(): UseSnippetsResult {
  const [snippets, setSnippets] = useState<SqlSnippet[]>(() => readFallback());
  const [loading, setLoading] = useState(true);
  const ref = useRef(snippets);
  ref.current = snippets;

  // Initial load from SQLite (or fallback). Ignore stale results if unmounted.
  useEffect(() => {
    let cancelled = false;
    listFromBackend().then((list) => {
      if (cancelled) return;
      setSnippets(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror to localStorage so a future cold start has *something* if the
  // Tauri host is briefly unavailable. Backend is the source of truth.
  useEffect(() => {
    if (loading) return;
    writeFallback(snippets);
  }, [snippets, loading]);

  const persist = useCallback((next: SqlSnippet) => {
    void saveToBackend(next);
  }, []);

  const removeRemote = useCallback((id: string) => {
    void deleteFromBackend(id);
  }, []);

  const add = useCallback(
    (input: { name: string; body: string }): SqlSnippet => {
      const created: SqlSnippet = {
        id: newId(),
        name: input.name.trim() || 'Untitled query',
        body: input.body,
        starred: false,
        lastRun: '—',
      };
      setSnippets((prev) => [created, ...prev]);
      persist(created);
      return created;
    },
    [persist],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<SqlSnippet, 'id'>>) => {
      setSnippets((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        const updated = next.find((s) => s.id === id);
        if (updated) persist(updated);
        return next;
      });
    },
    [persist],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      update(id, { name: trimmed });
    },
    [update],
  );

  const duplicate = useCallback(
    (id: string): SqlSnippet | null => {
      const source = ref.current.find((s) => s.id === id);
      if (!source) return null;
      const copy: SqlSnippet = {
        id: newId(),
        name: `${source.name} (copy)`,
        body: source.body,
        starred: false,
        lastRun: '—',
      };
      setSnippets((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        if (idx === -1) return [copy, ...prev];
        const next = prev.slice();
        next.splice(idx + 1, 0, copy);
        return next;
      });
      persist(copy);
      return copy;
    },
    [persist],
  );

  const toggleStar = useCallback(
    (id: string) => {
      setSnippets((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, starred: !s.starred } : s));
        const updated = next.find((s) => s.id === id);
        if (updated) persist(updated);
        return next;
      });
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      setSnippets((prev) => prev.filter((s) => s.id !== id));
      removeRemote(id);
    },
    [removeRemote],
  );

  return { snippets, loading, add, update, rename, duplicate, toggleStar, remove };
}
