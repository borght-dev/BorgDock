import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Kbd } from '@/components/shared/primitives';
import { usePrStore } from '@/stores/pr-store';
import { shortcutLabel } from '@/utils/shortcut-label';

/**
 * The PR list's search box state: a local value that follows the store when
 * something else changes it (a chip, a view), written to the store 300 ms
 * after the last keystroke so the list is not rebuilt on every key.
 */
function usePrSearchInput() {
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const storedSearch = usePrStore((s) => s.searchQuery);
  const [search, setSearch] = useState(storedSearch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the store when a chip, a view or a reset changes the query.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to external changes — depending on `search` would cycle on every keystroke
  useEffect(() => {
    if (storedSearch !== search) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSearch(storedSearch);
    }
  }, [storedSearch]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setSearch(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchQuery(v);
      }, 300);
    },
    [setSearchQuery],
  );

  /** Empty the box and the store at once (no debounce). */
  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearch('');
    setSearchQuery('');
  }, [setSearchQuery]);

  /** Write what is typed now (Enter), without waiting for the debounce. */
  const commit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearchQuery(search);
  }, [search, setSearchQuery]);

  return { search, handleChange, clear, commit };
}

/**
 * PrSearchField — the search box that leads the Pull requests view bar. It
 * takes free text and `field:value` qualifiers (`services/pr-list/query.ts`);
 * `/` and Ctrl+K focus it, Enter applies it at once, Esc clears it.
 */
export function PrSearchField() {
  const { search, handleChange, clear, commit } = usePrSearchInput();
  return (
    <label className="bd-wb-head__search bd-prl-search">
      <Search size={13} strokeWidth={2} aria-hidden="true" className="bd-wb-head__search-icon" />
      <input
        aria-label="Filter pull requests"
        type="text"
        value={search}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            return;
          }
          if (e.key !== 'Escape') return;
          e.preventDefault();
          if (search !== '') clear();
          else e.currentTarget.blur();
        }}
        placeholder="Search, or author:me is:failing repo:…"
        spellCheck={false}
        data-section-search
      />
      <Kbd>{shortcutLabel('K')}</Kbd>
    </label>
  );
}
