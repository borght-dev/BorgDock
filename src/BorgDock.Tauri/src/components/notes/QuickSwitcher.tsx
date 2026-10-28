import clsx from 'clsx';
import { FocusTrap } from 'focus-trap-react';
import { FileText, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { commands } from '@/generated/commands';
import { titleOf } from '@/services/notes/parse';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';

export type SwitcherMode = 'titles' | 'text';

interface Result {
  path: string;
  /** A matching line, for full-text results. */
  preview: string | null;
}

const MAX_RESULTS = 50;
let searchToken = 0;

/** Titles that hold every typed character in order; titles that start with the query first. */
export function matchTitles(paths: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...paths].sort((a, b) => b.localeCompare(a)).slice(0, MAX_RESULTS);
  const scored: { path: string; score: number }[] = [];
  for (const path of paths) {
    const title = titleOf(path).toLowerCase();
    let at = -1;
    let gaps = 0;
    let ok = true;
    for (const char of q) {
      const next = title.indexOf(char, at + 1);
      if (next < 0) {
        ok = false;
        break;
      }
      gaps += next - at - 1;
      at = next;
    }
    if (!ok) continue;
    const score = (title.startsWith(q) ? 0 : title.includes(q) ? 1000 : 2000) + gaps + title.length;
    scored.push({ path, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, MAX_RESULTS)
    .map((s) => s.path);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * QuickSwitcher — open a note by title (Ctrl+O), or search every note's
 * text (Ctrl+Shift+F). Enter on a title nobody has creates that note.
 */
export function QuickSwitcher({
  initialMode,
  onClose,
}: {
  initialMode: SwitcherMode;
  onClose: () => void;
}) {
  const texts = useNotesStore((s) => s.texts);
  const vaultPath = useNotesStore((s) => s.vaultPath);
  const [mode, setMode] = useState<SwitcherMode>(initialMode);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [textResults, setTextResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const paths = Object.keys(texts);
  const results: Result[] =
    mode === 'titles'
      ? matchTitles(paths, query).map((path) => ({ path, preview: null }))
      : textResults;
  const canCreate =
    mode === 'titles' &&
    query.trim().length > 0 &&
    !paths.some((p) => titleOf(p).toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (mode !== 'text' || !vaultPath) return;
    const q = query.trim();
    if (q.length < 2) {
      setTextResults([]);
      return;
    }
    const token = ++searchToken;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void commands.searchContent(vaultPath, escapeRegex(q), token).then((reply) => {
        if (token !== searchToken) return;
        setSearching(false);
        if (reply.status === 'error') {
          setTextResults([]);
          return;
        }
        setTextResults(
          reply.data
            .filter((r) => r.rel_path.toLowerCase().endsWith('.md') && !/(^|\/)\./.test(r.rel_path))
            .slice(0, MAX_RESULTS)
            .map((r) => ({ path: r.rel_path, preview: r.matches[0]?.preview.trim() ?? null })),
        );
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [mode, query, vaultPath]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = async (index: number) => {
    const store = useNotesStore.getState();
    const result = results[index];
    if (result) {
      store.open(result.path);
      onClose();
      return;
    }
    if (canCreate) {
      try {
        store.open(await store.createNote(query.trim(), ''));
        onClose();
      } catch (error) {
        toastError('Note not created', error);
      }
    }
  };

  const count = results.length + (canCreate ? 1 : 0);
  return (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: false }}>
      <div className="bd-notes-switcher__backdrop" onPointerDown={onClose}>
        <div
          className="bd-notes-switcher"
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'titles' ? 'Open a note' : 'Search notes'}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bd-notes-switcher__input">
            <Search size={14} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              placeholder={mode === 'titles' ? 'Open a note by title…' : 'Search every note…'}
              aria-label={mode === 'titles' ? 'Note title' : 'Search text'}
              aria-controls="bd-notes-switcher-list"
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, Math.max(count - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  void choose(active);
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  setMode((m) => (m === 'titles' ? 'text' : 'titles'));
                  setActive(0);
                }
              }}
            />
            <span className="bd-notes-switcher__mode">
              {mode === 'titles' ? 'Titles' : searching ? 'Searching…' : 'Text'} · Tab switches
            </span>
          </div>
          <ul id="bd-notes-switcher-list" ref={listRef} className="bd-notes-switcher__list">
            {results.map((result, index) => (
              <li key={result.path}>
                <button
                  type="button"
                  className={clsx(
                    'bd-notes-switcher__row',
                    index === active && 'bd-notes-switcher__row--active',
                  )}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => void choose(index)}
                >
                  <FileText size={13} aria-hidden="true" />
                  <span className="bd-notes-switcher__title">{titleOf(result.path)}</span>
                  <span className="bd-notes-switcher__path">
                    {result.preview ?? result.path.replace(/\/?[^/]+$/, '')}
                  </span>
                </button>
              </li>
            ))}
            {canCreate && (
              <li>
                <button
                  type="button"
                  className={clsx(
                    'bd-notes-switcher__row',
                    active === results.length && 'bd-notes-switcher__row--active',
                  )}
                  onMouseEnter={() => setActive(results.length)}
                  onClick={() => void choose(results.length)}
                >
                  <Plus size={13} aria-hidden="true" />
                  <span className="bd-notes-switcher__title">Create “{query.trim()}”</span>
                </button>
              </li>
            )}
            {count === 0 && (
              <li className="bd-notes-switcher__empty">
                {mode === 'text' && query.trim().length < 2
                  ? 'Type two characters or more.'
                  : 'Nothing matches.'}
              </li>
            )}
          </ul>
        </div>
      </div>
    </FocusTrap>
  );
}
