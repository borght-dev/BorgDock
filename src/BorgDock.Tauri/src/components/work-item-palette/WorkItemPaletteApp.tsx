import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Dot, Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { MiniAvatar, avatarToneFor } from '@/components/work-items/shared/wi-visuals';
import { ChipInput } from '@/components/work-item-palette/ChipInput';
import { FilterChip } from '@/components/work-item-palette/FilterChip';
import { GroupSeg } from '@/components/work-item-palette/GroupSeg';
import { WorkItemPaletteRow } from '@/components/work-item-palette/WorkItemPaletteRow';
import { applyOperators, parseOperators } from '@/components/work-item-palette/parseOperators';
import {
  type GroupBy,
  type ItemGroup,
  groupItems,
} from '@/components/work-item-palette/useGroupedItems';
import {
  saveCurrentPosition,
  useWorkItemPaletteSearch,
} from '@/hooks/useWorkItemPaletteSearch';

const PREFS_KEY = 'borgdock-palette-prefs';
const NAVLIST_KEY = 'borgdock-palette-navlist';

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
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids, savedAt: Date.now() }),
    );
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

  useEffect(() => {
    savePrefs({ stateFilter, groupBy });
  }, [stateFilter, groupBy]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reveal/focus on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      invoke('window_ready').catch(() => {});
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
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

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
    <div className="bd-wp-palette">
      <WindowTitleBar title="Work Items" meta={<Kbd>Ctrl+F9</Kbd>} />

      <div className="bd-wp-search-wrap">
        <ChipInput
          ref={inputRef}
          value={searchText}
          onChange={setSearchText}
          onKeyDown={handleInputKeyDown}
          placeholder="Search ID, title, @assignee, state:active, type:bug…"
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          <FilterChip active={stateFilter === 'all'} onClick={() => setStateFilter('all')}>
            All
          </FilterChip>
          <FilterChip active={stateFilter === 'open'} onClick={() => setStateFilter('open')}>
            Open
          </FilterChip>
          <FilterChip
            active={stateFilter === 'mine'}
            onClick={() => setStateFilter('mine')}
            icon={<MiniAvatar initials="ME" tone={avatarToneFor('ME')} size={13} />}
          >
            Mine
          </FilterChip>
          <FilterChip
            active={stateFilter === 'failing'}
            onClick={() => setStateFilter('failing')}
            tone="warning"
            icon={<Dot tone="yellow" size={6} />}
          >
            Testing Failed
          </FilterChip>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 10,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Group
          </span>
          <GroupSeg active={groupBy === 'none'} onClick={() => setGroupBy('none')}>
            —
          </GroupSeg>
          <GroupSeg active={groupBy === 'state'} onClick={() => setGroupBy('state')}>
            State
          </GroupSeg>
          <GroupSeg active={groupBy === 'assignee'} onClick={() => setGroupBy('assignee')}>
            Owner
          </GroupSeg>
          <GroupSeg active={groupBy === 'iter'} onClick={() => setGroupBy('iter')}>
            Iter
          </GroupSeg>
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
          const sectionStart = globalOffset;
          const rendered = (
            <div key={g.key}>
              {g.label && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px 4px',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-subtle-border)',
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    {g.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-faint)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {g.items.length}
                  </span>
                </div>
              )}
              {g.items.map((item, localIndex) => {
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
          globalOffset += g.items.length;
          return rendered;
        })}
      </div>

      <WindowStatusBar
        left={
          <span className="bd-mono">
            {isSearching && <span className="bd-wp-spinner bd-wp-spinner--inline" />}
            {statusText || (flatItems.length > 0 ? `${flatItems.length} results` : '')}
          </span>
        }
        right={
          <span className="bd-mono">
            <Kbd>{'↑↓'}</Kbd> nav · <Kbd>{'⏎'}</Kbd> open · <Kbd>esc</Kbd> close
          </span>
        }
      />
    </div>
  );
}
