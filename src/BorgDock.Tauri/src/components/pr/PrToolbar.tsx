import { ArrowDownUp, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Chip, Kbd, Seg2 } from '@/components/shared/primitives';
import type { AuthorLoad, PrGroupBy } from '@/services/pr-grouping';
import { type PrFilter, type SortBy, usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { shortcutLabel } from '@/utils/shortcut-label';

export type PrFilterCountKey = 'all' | 'needs' | 'mine' | 'failing' | 'ready' | 'review' | 'closed';

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

const GROUP_OPTIONS: ReadonlyArray<{ value: PrGroupBy; label: string }> = [
  { value: 'author', label: 'Author' },
  { value: 'repo', label: 'Repo' },
  { value: 'status', label: 'Status' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title' },
];

interface Props {
  counts: PrFilterCounts;
  /** Per-author open/failing counts shown on the second row. Omit to hide the row. */
  authors?: AuthorLoad[];
}

/**
 * PrToolbar — filter chips, group segmented control, sort menu, search, and
 * the per-author strip. Row density lives in Settings → Appearance.
 *
 * Replaces `components/layout/FilterBar.tsx` + `components/layout/SearchBar.tsx`,
 * but stays per-section (mounted inside `PrList`, not the global titlebar).
 *
 * Filter and search state live in `usePrStore` (same store the old FilterBar /
 * SearchBar used). Search is debounced 300ms to avoid thrashing the filtered-PR
 * memoization on every keystroke.
 */
export function PrToolbar({ counts, authors }: Props) {
  const filter = usePrStore((s) => s.filter);
  const setFilter = usePrStore((s) => s.setFilter);
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const storedSearch = usePrStore((s) => s.searchQuery);
  const sortBy = usePrStore((s) => s.sortBy);
  const setSortBy = usePrStore((s) => s.setSortBy);
  const groupBy = useUiStore((s) => s.prGroupBy);
  const setGroupBy = useUiStore((s) => s.setPrGroupBy);

  const [search, setSearch] = useState(storedSearch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if the store search is reset externally.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to external resets — depending on `search` would cycle on every keystroke
  useEffect(() => {
    if (storedSearch !== search) {
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

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Updated';

  return (
    <div className="bd-pr-toolbar">
      <div className="bd-pr-toolbar__row">
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
        <div className="bd-pr-toolbar__view-control" role="group" aria-label="Group pull requests">
          <span>Group</span>
          <Seg2 size="sm" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        </div>
        <label className="bd-pr-toolbar__sort">
          <ArrowDownUp
            size={12}
            strokeWidth={2.25}
            aria-hidden="true"
            className="text-[var(--color-text-tertiary)]"
          />
          {sortLabel}
          <ChevronDown
            size={11}
            strokeWidth={2.25}
            aria-hidden="true"
            className="text-[var(--color-text-muted)]"
          />
          <select
            aria-label="Sort pull requests"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="bd-pr-toolbar__search">
          <Search
            size={13}
            strokeWidth={2.25}
            aria-hidden="true"
            className="bd-pr-toolbar__search-icon"
          />
          <input
            aria-label="Filter pull requests"
            type="text"
            value={search}
            onChange={handleChange}
            placeholder="Filter pull requests…"
            data-section-search
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </div>
      </div>
      {authors && authors.length > 0 && (
        <div className="bd-pr-toolbar__authors" aria-label="Pull requests by author">
          {authors.map((author) => (
            <span key={author.login.toLowerCase()} className="bd-pr-author-chip">
              <Avatar
                initials={author.login.slice(0, 2).toUpperCase()}
                tone={author.isMe ? 'own' : 'them'}
                size="sm"
              />
              <span>
                {author.login}
                {author.isMe ? ' (you)' : ''}
              </span>
              <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
                {author.count}
              </span>
              {author.failing > 0 && (
                <span className="text-[10.5px] font-semibold text-[var(--color-status-red)]">
                  {author.failing} failing
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
