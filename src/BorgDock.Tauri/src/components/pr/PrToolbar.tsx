import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip, Kbd } from '@/components/shared/primitives';
import { type PrFilter, usePrStore } from '@/stores/pr-store';

export type PrFilterCountKey =
  | 'all'
  | 'needs'
  | 'mine'
  | 'failing'
  | 'ready'
  | 'review'
  | 'closed';

export interface PrFilterCounts {
  all: number;
  needs: number;
  mine: number;
  failing: number;
  ready: number;
  review: number;
  closed: number;
}

interface FilterDef {
  /** UI key — used by the {@link PrFilterCounts} map. */
  key: PrFilterCountKey;
  /** Store key — what `usePrStore`'s `filter` field expects. */
  storeKey: PrFilter;
  label: string;
  tone?: 'error';
}

const FILTERS: FilterDef[] = [
  { key: 'all', storeKey: 'all', label: 'All' },
  { key: 'needs', storeKey: 'needsReview', label: 'Needs Review' },
  { key: 'mine', storeKey: 'mine', label: 'Mine' },
  { key: 'failing', storeKey: 'failing', label: 'Failing', tone: 'error' },
  { key: 'ready', storeKey: 'ready', label: 'Ready' },
  { key: 'review', storeKey: 'reviewing', label: 'Review' },
  { key: 'closed', storeKey: 'closed', label: 'Closed' },
];

interface Props {
  counts: PrFilterCounts;
}

/**
 * PrToolbar — filter pills + search input.
 *
 * Replaces `components/layout/FilterBar.tsx` + `components/layout/SearchBar.tsx`,
 * but stays per-section (mounted inside `PrList`, not the global titlebar).
 *
 * Filter and search state live in `usePrStore` (same store the old FilterBar /
 * SearchBar used). Search is debounced 300ms to avoid thrashing the filtered-PR
 * memoization on every keystroke.
 */
export function PrToolbar({ counts }: Props) {
  const filter = usePrStore((s) => s.filter);
  const setFilter = usePrStore((s) => s.setFilter);
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const storedSearch = usePrStore((s) => s.searchQuery);

  const [search, setSearch] = useState(storedSearch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if the store search is reset externally.
  useEffect(() => {
    if (storedSearch !== search) {
      setSearch(storedSearch);
    }
    // Intentionally only react to external resets — avoid cycle on keystroke.
    // biome-ignore lint/correctness/useExhaustiveDependencies: external-reset only
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

  return (
    <div className="bd-pr-toolbar">
      <div className="bd-pr-toolbar__pills">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter === f.storeKey}
            count={counts[f.key]}
            tone={f.tone}
            onClick={() => setFilter(f.storeKey)}
            data-filter-chip
            data-filter-key={f.key}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      <span className="bd-spacer" />
      <div className="bd-pr-toolbar__search">
        <SearchIcon />
        <input
          aria-label="Filter pull requests"
          type="text"
          value={search}
          onChange={handleChange}
          placeholder="Filter pull requests…"
        />
        <Kbd>⌘K</Kbd>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="bd-pr-toolbar__search-icon"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="m11 11 3.5 3.5" />
    </svg>
  );
}
