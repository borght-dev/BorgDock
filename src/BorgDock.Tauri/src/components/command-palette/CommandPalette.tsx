import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Kbd } from '@/components/shared/primitives';
import { AdoClient } from '@/services/ado/client';
import { getWorkItems, searchWorkItemsByIdPrefix } from '@/services/ado/workitems';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';

interface ResultItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
}

interface Section {
  label: string;
  items: ResultItem[];
}

function getField(item: WorkItem, field: string): string {
  const value = item.fields[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
  }
  return '';
}

function mapWorkItem(wi: WorkItem): ResultItem {
  return {
    id: wi.id,
    title: getField(wi, 'System.Title'),
    state: getField(wi, 'System.State'),
    workItemType: getField(wi, 'System.WorkItemType'),
    assignedTo: getField(wi, 'System.AssignedTo'),
  };
}

interface CommandPaletteProps {
  onSelectWorkItem: (id: number) => void;
}

export function CommandPalette({ onSelectWorkItem }: CommandPaletteProps) {
  const isOpen = useUiStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const settings = useSettingsStore((s) => s.settings);

  const workItems = useWorkItemsStore((s) => s.workItems);
  const workingOnIds = useWorkItemsStore((s) => s.workingOnWorkItemIds);
  const currentUser = useWorkItemsStore((s) => s.currentUserDisplayName);
  const recentIds = useWorkItemsStore((s) => s.recentWorkItemIds);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [statusText, setStatusText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [recentItems, setRecentItems] = useState<ResultItem[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const searchCtsRef = useRef<AbortController | null>(null);

  const isSearchMode = searchText.trim().length > 0;

  const getClient = useCallback(() => {
    const ado = settings.azureDevOps;
    return new AdoClient(
      ado.organization,
      ado.project,
      ado.personalAccessToken ?? '',
      ado.authMethod,
    );
  }, [settings.azureDevOps]);

  // Build the "Working On" and "Assigned to Me" sections from in-memory work items
  const workingOnSection: ResultItem[] = useMemo(() => {
    if (workingOnIds.size === 0) return [];
    return workItems.filter((wi) => workingOnIds.has(wi.id)).map(mapWorkItem);
  }, [workItems, workingOnIds]);

  const assignedToMeSection: ResultItem[] = useMemo(() => {
    if (!currentUser) return [];
    return workItems
      .filter((wi) => {
        const assignee = getField(wi, 'System.AssignedTo');
        return assignee.toLowerCase() === currentUser.toLowerCase() && !workingOnIds.has(wi.id);
      })
      .map(mapWorkItem);
  }, [workItems, currentUser, workingOnIds]);

  // Build sections for browse mode
  const browseSections: Section[] = useMemo(() => {
    const sections: Section[] = [];
    if (workingOnSection.length > 0) {
      sections.push({ label: 'Working On', items: workingOnSection });
    }
    if (assignedToMeSection.length > 0) {
      sections.push({ label: 'Assigned to Me', items: assignedToMeSection });
    }
    if (recentItems.length > 0) {
      // Exclude items already shown in working-on or assigned sections
      const shownIds = new Set([
        ...workingOnSection.map((i) => i.id),
        ...assignedToMeSection.map((i) => i.id),
      ]);
      const filtered = recentItems.filter((i) => !shownIds.has(i.id));
      if (filtered.length > 0) {
        sections.push({ label: 'Recent', items: filtered });
      }
    }
    return sections;
  }, [workingOnSection, assignedToMeSection, recentItems]);

  // Flat list of all browse items for keyboard navigation
  const browseFlat: ResultItem[] = useMemo(
    () => browseSections.flatMap((s) => s.items),
    [browseSections],
  );

  // The navigable items list depends on mode
  const navItems = isSearchMode ? searchResults : browseFlat;

  // Load recent items from ADO when palette opens
  useEffect(() => {
    if (!isOpen) return;

    // Find recent IDs that are NOT already in the local workItems array
    const localIds = new Set(workItems.map((wi) => wi.id));
    const missingIds = recentIds.filter((id) => !localIds.has(id));

    // Map local items immediately
    const localRecent = recentIds
      .filter((id) => localIds.has(id))
      .map((id) => {
        const wi = workItems.find((w) => w.id === id)!;
        return mapWorkItem(wi);
      });

    if (missingIds.length === 0) {
      setRecentItems(localRecent);
      return;
    }

    // Fetch missing items from ADO
    setIsLoadingRecent(true);
    const client = getClient();
    getWorkItems(client, missingIds)
      .then((fetched) => {
        const fetchedMap = new Map(fetched.map((wi) => [wi.id, mapWorkItem(wi)]));
        // Rebuild in original order
        const all = recentIds
          .map((id) => {
            const local = localRecent.find((l) => l.id === id);
            if (local) return local;
            return fetchedMap.get(id) ?? null;
          })
          .filter((x): x is ResultItem => x !== null);
        setRecentItems(all);
      })
      .catch(() => {
        // Best-effort: show what we have locally
        setRecentItems(localRecent);
      })
      .finally(() => setIsLoadingRecent(false));
  }, [isOpen, getClient, recentIds, workItems]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setSearchResults([]);
      setSelectedIndex(browseFlat.length > 0 ? 0 : -1);
      setStatusText('');
      setIsSearching(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, browseFlat.length]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    searchCtsRef.current?.abort();

    if (!searchText.trim()) {
      setSearchResults([]);
      setSelectedIndex(browseFlat.length > 0 ? 0 : -1);
      setStatusText('');
      return;
    }

    if (!/^\d+$/.test(searchText)) {
      setSearchResults([]);
      setSelectedIndex(-1);
      setStatusText('Type a numeric ID');
      return;
    }

    if (searchText.length < 2) {
      setSearchResults([]);
      setSelectedIndex(-1);
      setStatusText('Type at least 2 digits');
      return;
    }

    const controller = new AbortController();
    searchCtsRef.current = controller;

    setIsSearching(true);
    setStatusText('Searching...');

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;

      try {
        const client = getClient();
        const items = await searchWorkItemsByIdPrefix(client, searchText);
        if (controller.signal.aborted) return;

        const mapped = items.map(mapWorkItem);
        setSearchResults(mapped);
        setSelectedIndex(mapped.length > 0 ? 0 : -1);
        setStatusText(
          mapped.length === 0
            ? 'No results'
            : mapped.length === 1
              ? '1 result'
              : `${mapped.length} results`,
        );
      } catch {
        if (!controller.signal.aborted) {
          setStatusText('Search failed');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, isOpen, getClient, browseFlat.length]);

  const handleSelect = useCallback(
    (id: number) => {
      setOpen(false);

      // Record as recent
      useWorkItemsStore.getState().addRecentWorkItem(id);
      const ids = useWorkItemsStore.getState().recentWorkItemIds;
      const current = useSettingsStore.getState().settings;
      useSettingsStore.getState().saveSettings({
        ...current,
        azureDevOps: { ...current.azureDevOps, recentWorkItemIds: ids },
      });

      onSelectWorkItem(id);
    },
    [setOpen, onSelectWorkItem],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (navItems.length > 0) {
            setSelectedIndex((i) => (i <= 0 ? navItems.length - 1 : i - 1));
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (navItems.length > 0) {
            setSelectedIndex((i) => (i >= navItems.length - 1 ? 0 : i + 1));
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < navItems.length) {
            const item = navItems[selectedIndex];
            if (item) handleSelect(item.id);
          }
          break;
      }
    },
    [navItems, selectedIndex, setOpen, handleSelect],
  );

  if (!isOpen) return null;

  // Compute a flat index offset for each section so we can map section-local index to global
  let globalOffset = 0;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      // inline rgba: backdrop overlay, no token covers semi-transparent overlay
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) setOpen(false);
      }}
    >
      <div
        className="w-[460px] rounded-xl border bg-[var(--color-card-background)] border-[var(--color-strong-border)] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="p-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search work item by ID..."
            className="bd-input w-full rounded-lg border px-3 py-2.5 text-base outline-none bg-[var(--color-input-bg)] border-[var(--color-input-border)] text-[var(--color-text-primary)] caret-[var(--color-accent)]"
          />
        </div>

        {/* Content area */}
        <div className="max-h-80 overflow-y-auto">
          {isSearchMode ? (
            /* Search results */
            searchResults.map((item, index) => (
              <PaletteRow
                key={item.id}
                item={item}
                isSelected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onSelect={handleSelect}
              />
            ))
          ) : (
            /* Browse sections */
            <>
              {browseSections.length === 0 && !isLoadingRecent && (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--color-text-muted)]">
                  Type a work item ID to search
                </div>
              )}
              {isLoadingRecent && browseSections.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-[var(--color-text-muted)]" />
                  <span className="text-[13px] text-[var(--color-text-muted)]">Loading...</span>
                </div>
              )}
              {browseSections.map((section) => {
                const sectionStart = globalOffset;
                const rendered = (
                  <div key={section.label}>
                    <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      {section.label}
                    </div>
                    {section.items.map((item, localIndex) => {
                      const flatIndex = sectionStart + localIndex;
                      return (
                        <PaletteRow
                          key={item.id}
                          item={item}
                          isSelected={flatIndex === selectedIndex}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          onSelect={handleSelect}
                        />
                      );
                    })}
                  </div>
                );
                globalOffset += section.items.length;
                return rendered;
              })}
            </>
          )}
        </div>

        {/* Separator */}
        {(navItems.length > 0 || browseSections.length > 0) && (
          <div className="h-px bg-[var(--color-separator)]" />
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs text-[var(--color-text-muted)]">
            {isSearching && (
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent align-middle" />
            )}
            {statusText || (isSearchMode ? '' : `\u2191\u2193 navigate \u00b7 \u23ce select`)}
          </span>
          <span className="text-[11px] text-[var(--color-text-faint)]">
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  item,
  isSelected,
  onMouseEnter,
  onSelect,
}: {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}) {
  return (
    <div
      data-palette-row
      className={clsx(
        'flex cursor-pointer items-center justify-between px-4 py-2 transition-colors',
        isSelected
          ? 'bg-[var(--color-accent-subtle)]'
          : 'bg-transparent hover:bg-[var(--color-surface-hover)]',
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[13px] font-bold text-[var(--color-accent)]">
          #{item.id}
        </span>
        <span className="truncate text-[13px] text-[var(--color-text-primary)]">{item.title}</span>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.workItemType}</span>
        <span className="text-[11px] font-semibold text-[var(--color-accent)]">{item.state}</span>
      </div>
    </div>
  );
}
