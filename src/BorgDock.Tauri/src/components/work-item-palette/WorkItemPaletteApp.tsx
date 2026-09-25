import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Dot, Kbd, Seg2, SlidingHighlight } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { ChipInput } from '@/components/work-item-palette/ChipInput';
import { FilterChip } from '@/components/work-item-palette/FilterChip';
import { applyOperators, parseOperators } from '@/components/work-item-palette/parseOperators';
import {
  type GroupBy,
  groupItems,
  type ItemGroup,
} from '@/components/work-item-palette/useGroupedItems';
import { WorkItemPaletteRow } from '@/components/work-item-palette/WorkItemPaletteRow';
import { avatarToneFor, MiniAvatar } from '@/components/work-items/shared/wi-visuals';
import { saveCurrentPosition, useWorkItemPaletteSearch } from '@/hooks/useWorkItemPaletteSearch';
import { flipIfSmall } from '@/utils/motion';
import { revealWindow } from '@/utils/window-reveal';

const WORK_ITEM_PALETTE_HINTS = [
  { keys: '↑↓', label: 'move' },
  { keys: '↵', label: 'open' },
  { keys: 'Esc', label: 'close' },
];

const GROUP_OPTIONS: ReadonlyArray<{ value: GroupBy; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'state', label: 'State' },
  { value: 'assignee', label: 'Owner' },
  { value: 'iter', label: 'Iteration' },
];

const PREFS_KEY = 'borgdock-palette-prefs';
const NAVLIST_KEY = 'borgdock-palette-navlist';
const COLLAPSED_KEY = 'borgdock-palette-collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveCollapsed(collapsed: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* ignore */
  }
}

type StateFilter = 'all' | 'open' | 'mine' | 'failing';

interface Prefs {
  stateFilter: StateFilter;
  groupBy: GroupBy;
}

const STATE_FILTERS: StateFilter[] = ['all', 'open', 'mine', 'failing'];
const GROUP_BYS: GroupBy[] = ['none', 'state', 'assignee', 'iter'];

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { stateFilter?: unknown; groupBy?: unknown };
      const stateFilter = STATE_FILTERS.includes(parsed.stateFilter as StateFilter)
        ? (parsed.stateFilter as StateFilter)
        : 'all';
      const groupBy = GROUP_BYS.includes(parsed.groupBy as GroupBy)
        ? (parsed.groupBy as GroupBy)
        : 'none';
      return { stateFilter, groupBy };
    }
  } catch {
    /* ignore */
  }
  return { stateFilter: 'all', groupBy: 'none' };
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function saveNavlist(ids: number[]) {
  try {
    localStorage.setItem(NAVLIST_KEY, JSON.stringify({ ids, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function WorkItemPaletteApp() {
  const {
    searchText,
    setSearchText,
    selectedIndex,
    setSelectedIndex,
    statusText,
    isSearching,
    isSearchMode,
    isLoadingBrowse,
    browseSections,
    navItems,
    selectAndClose,
    assignedToMeIds,
  } = useWorkItemPaletteSearch();

  const initialPrefs = useMemo(loadPrefs, []);
  const [stateFilter, setStateFilter] = useState<StateFilter>(initialPrefs.stateFilter);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialPrefs.groupBy);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsed);

  useEffect(() => {
    savePrefs({ stateFilter, groupBy });
  }, [stateFilter, groupBy]);

  useEffect(() => {
    saveCollapsed(collapsedGroups);
  }, [collapsedGroups]);

  const toggleGroupCollapsed = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Typing FLIPs the rows that stay to their new slots (flip() from
  // utils/motion; long lists just change).
  const changeSearchText = useCallback(
    (value: string) => {
      void flipIfSmall(listRef.current, () => flushSync(() => setSearchText(value)), {
        plain: () => setSearchText(value),
      });
    },
    [setSearchText],
  );

  // Reveal/focus on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      void revealWindow();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Esc → hide.
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        getCurrentWindow().hide().catch(console.debug);
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Reset on re-show.
  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      setSearchText('');
      setSelectedIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [setSearchText, setSelectedIndex]);

  // Save position on move.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => saveCurrentPosition());
    })();
    return () => unlisten?.();
  }, []);

  // Apply state filter + operators on top of the hook's results.
  const filteredItems = useMemo(() => {
    const { ops } = parseOperators(searchText);
    let xs = navItems;
    if (stateFilter === 'open') {
      xs = xs.filter((x) => x.state !== 'Closed' && x.state !== 'Removed' && x.state !== 'Done');
    } else if (stateFilter === 'mine') {
      xs = xs.filter((x) => assignedToMeIds.has(x.id));
    } else if (stateFilter === 'failing') {
      xs = xs.filter((x) => x.state === 'Testing Failed');
    }
    return applyOperators(xs, ops, assignedToMeIds);
  }, [navItems, stateFilter, searchText, assignedToMeIds]);

  // Decide groups: in browse mode without a group-by, fall back to the hook's
  // section structure. Otherwise apply our own grouper.
  const groups: ItemGroup[] = useMemo(() => {
    if (!isSearchMode && stateFilter === 'all' && groupBy === 'none') {
      return browseSections.map((s) => ({ key: s.label, label: s.label, items: s.items }));
    }
    const currentUserName = ''; // see "Mine" filter — we use the assigned-to-me set instead
    return groupItems(filteredItems, groupBy, currentUserName);
  }, [isSearchMode, stateFilter, groupBy, browseSections, filteredItems]);

  // Flat order of items for keyboard nav (matches render order).
  // Items in collapsed groups are excluded from keyboard nav and from the
  // total result count; only headers stay visible for them.
  const flatItems = useMemo(
    () => groups.flatMap((g) => (collapsedGroups.has(g.key) ? [] : g.items)),
    [groups, collapsedGroups],
  );

  // Re-bound selection.
  useEffect(() => {
    if (flatItems.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex < 0 || selectedIndex >= flatItems.length) {
      setSelectedIndex(0);
    }
  }, [flatItems.length, selectedIndex, setSelectedIndex]);

  // Scroll selected into view.
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const allRows = listRef.current.querySelectorAll('[data-palette-row]');
    allRows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Adapter — selectAndClose persists navlist before opening the detail.
  const openItem = useCallback(
    (id: number) => {
      saveNavlist(flatItems.map((i) => i.id));
      selectAndClose(id);
    },
    [flatItems, selectAndClose],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (flatItems.length > 0) {
            setSelectedIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (flatItems.length > 0) {
            setSelectedIndex((i) => (i >= flatItems.length - 1 ? 0 : i + 1));
          }
          break;
        case 'Enter': {
          e.preventDefault();
          const item = flatItems[selectedIndex];
          if (item) openItem(item.id);
          break;
        }
      }
    },
    [flatItems, selectedIndex, openItem, setSelectedIndex],
  );

  let globalOffset = 0;
  return (
    // The palette shell is interactive from first paint — search input,
    // filters, and the empty state all render before the hook's IPC
    // resolves. Marking ready synchronously matches that UX.
    <div className="bd-wp-palette" data-app-ready="true">
      <WindowTitleBar title="Work Items" meta={<Kbd>Ctrl+F9</Kbd>} />

      <div className="bd-wp-search-wrap">
        <ChipInput
          ref={inputRef}
          value={searchText}
          onChange={changeSearchText}
          onKeyDown={handleInputKeyDown}
          placeholder="Search ID, title, @assignee, state:active, type:bug…"
        />

        <div className="bd-wp-toolbar">
          {/* The wash slides to the chosen filter (SlidingHighlight, --motion-move). */}
          <SlidingHighlight
            activeKey={stateFilter}
            className="bd-wp-filters"
            highlightClassName={clsx(
              'bd-wp-filters__hl',
              stateFilter === 'failing' && 'bd-wp-filters__hl--warn',
            )}
            role="group"
            aria-label="Filter work items"
          >
            <FilterChip
              highlightKey="all"
              active={stateFilter === 'all'}
              onClick={() => setStateFilter('all')}
            >
              All
            </FilterChip>
            <FilterChip
              highlightKey="open"
              active={stateFilter === 'open'}
              onClick={() => setStateFilter('open')}
            >
              Open
            </FilterChip>
            <FilterChip
              highlightKey="mine"
              active={stateFilter === 'mine'}
              onClick={() => setStateFilter('mine')}
              icon={<MiniAvatar initials="ME" tone={avatarToneFor('ME')} size={13} />}
            >
              Mine
            </FilterChip>
            <FilterChip
              highlightKey="failing"
              active={stateFilter === 'failing'}
              onClick={() => setStateFilter('failing')}
              tone="warning"
              icon={<Dot tone="yellow" size={6} />}
            >
              Testing Failed
            </FilterChip>
          </SlidingHighlight>
          <span className="bd-wp-toolbar__spacer" />
          <span className="bd-wp-toolbar__label">Group by</span>
          <Seg2
            ariaLabel="Group by"
            size="sm"
            value={groupBy}
            options={GROUP_OPTIONS}
            onChange={setGroupBy}
          />
        </div>
      </div>

      <div ref={listRef} className="bd-wp-content">
        {flatItems.length === 0 && !isLoadingBrowse && (
          <div className="bd-wp-empty">
            {isSearchMode || stateFilter !== 'all' || groupBy !== 'none'
              ? 'No work items match your filters.'
              : 'Type to search work items'}
          </div>
        )}
        {isLoadingBrowse && flatItems.length === 0 && (
          <div className="bd-wp-loading">
            <span className="bd-wp-spinner" />
            <span>Loading…</span>
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = collapsedGroups.has(g.key);
          const sectionStart = globalOffset;
          const rendered = (
            <div key={g.key}>
              {g.label && (
                <button
                  type="button"
                  className="bd-wp-group"
                  onClick={() => toggleGroupCollapsed(g.key)}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown
                    size={9}
                    strokeWidth={3}
                    className={clsx(
                      'bd-wp-group__caret',
                      isCollapsed && 'bd-wp-group__caret--collapsed',
                    )}
                  />
                  <span className="bd-wp-group__label">{g.label}</span>
                  <span className="bd-wp-group__count">{g.items.length}</span>
                </button>
              )}
              {!isCollapsed &&
                g.items.map((item, localIndex) => {
                  const flatIndex = sectionStart + localIndex;
                  return (
                    <WorkItemPaletteRow
                      key={item.id}
                      item={item}
                      isSelected={flatIndex === selectedIndex}
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      onSelect={openItem}
                    />
                  );
                })}
            </div>
          );
          if (!isCollapsed) globalOffset += g.items.length;
          return rendered;
        })}
      </div>

      <WindowStatusBar
        left={
          <span>
            {isSearching && <span className="bd-wp-spinner bd-wp-spinner--inline" />}
            {statusText || (flatItems.length > 0 ? `${flatItems.length} results` : '')}
          </span>
        }
        hints={WORK_ITEM_PALETTE_HINTS}
      />
    </div>
  );
}
