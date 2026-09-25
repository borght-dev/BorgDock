import { Check, ListFilter, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from '@/components/shared/primitives';
import type { PrGroupBy } from '@/services/pr-grouping';
import { type PrFilter, type SortBy, usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { shortcutLabel } from '@/utils/shortcut-label';
import {
  PrFilterControl,
  type WorkbenchFilter,
  type WorkbenchFilterCounts,
} from './PrFilterControl';

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

/**
 * The PR list's search box state: a local value that follows the store when
 * something else resets it, written to the store 300 ms after the last
 * keystroke so the filtered-PR memo is not rebuilt on every key.
 */
function usePrSearchInput() {
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const storedSearch = usePrStore((s) => s.searchQuery);
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

  /** Empty the box and the store at once (no debounce). */
  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearch('');
    setSearchQuery('');
  }, [setSearchQuery]);

  return { search, handleChange, clear };
}

interface GroupSortMenuProps {
  groupBy: PrGroupBy;
  sortBy: SortBy;
  onGroupByChange: (groupBy: PrGroupBy) => void;
  onSortChange: (sortBy: SortBy) => void;
}

/**
 * "Group and sort" — one small menu button for the list's grouping (Author,
 * Repo, Status) and sort order (Updated, Created, Title). The menu is only in
 * the DOM while open, so the single-key shortcuts stand down exactly then
 * (`isOverlayOpen` looks for `role="menu"`).
 */
function GroupSortMenu({ groupBy, sortBy, onGroupByChange, onSortChange }: GroupSortMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (!current && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.right - 200) });
      }
      return !current;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc closes the menu, not the view or the list selection.
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const choose = (apply: () => void) => {
    close();
    triggerRef.current?.focus();
    apply();
  };

  const groupLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'Author';
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Updated';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bd-wb-head__menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Group and sort"
        title={`Grouped by ${groupLabel.toLowerCase()}, sorted by ${sortLabel.toLowerCase()}`}
        onClick={toggle}
      >
        <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Group and sort"
            className="bd-wb-menu"
            style={position}
          >
            <div className="bd-wb-menu__label" id="bd-wb-menu-group">
              Group by
            </div>
            <div role="group" aria-labelledby="bd-wb-menu-group">
              {GROUP_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.value === groupBy}
                  className="bd-wb-menu__item"
                  onClick={() => choose(() => onGroupByChange(o.value))}
                >
                  <span className="bd-wb-menu__check" aria-hidden="true">
                    {o.value === groupBy && <Check size={13} strokeWidth={2.25} />}
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="bd-wb-menu__separator" role="separator" />
            <div className="bd-wb-menu__label" id="bd-wb-menu-sort">
              Sort by
            </div>
            <div role="group" aria-labelledby="bd-wb-menu-sort">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.value === sortBy}
                  className="bd-wb-menu__item"
                  onClick={() => choose(() => onSortChange(o.value))}
                >
                  <span className="bd-wb-menu__check" aria-hidden="true">
                    {o.value === sortBy && <Check size={13} strokeWidth={2.25} />}
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

interface WorkbenchPrHeadProps {
  /** The filter to show as chosen (the list passes a just-picked one before the store has it). */
  filter: PrFilter;
  counts: WorkbenchFilterCounts;
  /** Filter, group and sort changes go through the list so it can FLIP its rows. */
  onFilterChange: (filter: WorkbenchFilter) => void;
  onGroupByChange: (groupBy: PrGroupBy) => void;
  onSortChange: (sortBy: SortBy) => void;
}

/**
 * WorkbenchPrHead — the Pull requests list's head row: the "Pull requests"
 * title, the segmented filter, the search box (debounced into `pr-store`;
 * `/` and Ctrl+K focus it, Esc clears it) and the "Group and sort" menu.
 */
export function WorkbenchPrHead({
  filter,
  counts,
  onFilterChange,
  onGroupByChange,
  onSortChange,
}: WorkbenchPrHeadProps) {
  const sortBy = usePrStore((s) => s.sortBy);
  const groupBy = useUiStore((s) => s.prGroupBy);
  const { search, handleChange, clear } = usePrSearchInput();

  return (
    <header className="bd-wb-head">
      <h1 className="bd-wb-head__title">Pull requests</h1>
      <PrFilterControl value={filter} counts={counts} onChange={onFilterChange} />
      <label className="bd-wb-head__search">
        <Search size={13} strokeWidth={2} aria-hidden="true" className="bd-wb-head__search-icon" />
        <input
          aria-label="Filter pull requests"
          type="text"
          value={search}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            if (search !== '') clear();
            else e.currentTarget.blur();
          }}
          placeholder="Search pull requests"
          data-section-search
        />
        <Kbd>{shortcutLabel('K')}</Kbd>
      </label>
      <GroupSortMenu
        groupBy={groupBy}
        sortBy={sortBy}
        onGroupByChange={onGroupByChange}
        onSortChange={onSortChange}
      />
    </header>
  );
}
