import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdoClient } from '@/services/ado/client';
import {
  getAssignedToMe,
  getWorkItems,
  searchWorkItemsByIdPrefix,
  searchWorkItemsByText,
} from '@/services/ado/workitems';
import type { WorkItem } from '@/types';
import type { AppSettings, AzureDevOpsSettings } from '@/types/settings';

export interface ResultItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
}

export interface Section {
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

const POSITION_KEY = 'prdock-palette-position';

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveCurrentPosition() {
  try {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const scale = await win.scaleFactor();
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({
        x: Math.round(pos.x / scale),
        y: Math.round(pos.y / scale),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function usePaletteSearch() {
  const [adoSettings, setAdoSettings] = useState<AzureDevOpsSettings | null>(null);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [workingOnIds, setWorkingOnIds] = useState<Set<number>>(new Set());
  const [recentItems, setRecentItems] = useState<ResultItem[]>([]);
  const [assignedToMeItems, setAssignedToMeItems] = useState<ResultItem[]>([]);
  const [workingOnItems, setWorkingOnItems] = useState<ResultItem[]>([]);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [statusText, setStatusText] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const searchCtsRef = useRef<AbortController | null>(null);

  const isSearchMode = searchText.trim().length > 0;

  // Load settings and restore saved position on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke<AppSettings>('load_settings');
        setAdoSettings(settings.azureDevOps);
        setRecentIds(settings.azureDevOps.recentWorkItemIds ?? []);
        setWorkingOnIds(new Set(settings.azureDevOps.workingOnWorkItemIds ?? []));
        const t = settings.ui?.theme ?? 'system';
        const isDark =
          t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }

      // Restore saved position (only if it's on-screen)
      const saved = loadSavedPosition();
      if (
        saved &&
        saved.x >= 0 &&
        saved.y >= 0 &&
        saved.x < screen.width &&
        saved.y < screen.height
      ) {
        try {
          const { LogicalPosition } = await import('@tauri-apps/api/dpi');
          await getCurrentWindow().setPosition(new LogicalPosition(saved.x, saved.y));
        } catch {
          /* ignore — use center */
        }
      }
    })();
  }, []);

  // Fetch browse items (working on, assigned to me, recent) from ADO
  useEffect(() => {
    if (!adoSettings) return;
    const client = new AdoClient(
      adoSettings.organization,
      adoSettings.project,
      adoSettings.personalAccessToken ?? '',
    );

    setIsLoadingBrowse(true);

    const allIds = [...workingOnIds, ...recentIds];
    const uniqueIds = [...new Set(allIds)];

    // Fetch working-on + recent items and assigned-to-me in parallel
    Promise.all([
      uniqueIds.length > 0 ? getWorkItems(client, uniqueIds) : Promise.resolve([]),
      getAssignedToMe(client).catch(() => []),
    ])
      .then(([fetchedItems, assignedItems]) => {
        const byId = new Map(fetchedItems.map((wi) => [wi.id, wi]));

        // Working on
        const working = [...workingOnIds]
          .map((id) => byId.get(id))
          .filter((wi): wi is WorkItem => wi !== undefined)
          .map(mapWorkItem);
        setWorkingOnItems(working);

        // Assigned to me
        setAssignedToMeItems(assignedItems.map(mapWorkItem));

        // Recent (preserve order)
        const recent = recentIds
          .map((id) => byId.get(id))
          .filter((wi): wi is WorkItem => wi !== undefined)
          .map(mapWorkItem);
        setRecentItems(recent);
      })
      .catch(() => {
        /* best effort */
      })
      .finally(() => setIsLoadingBrowse(false));
  }, [adoSettings, recentIds, workingOnIds]);

  // Build sections for browse mode
  const browseSections: Section[] = useMemo(() => {
    const sections: Section[] = [];
    const shownIds = new Set<number>();

    if (workingOnItems.length > 0) {
      sections.push({ label: 'Working On', items: workingOnItems });
      for (const i of workingOnItems) shownIds.add(i.id);
    }

    if (assignedToMeItems.length > 0) {
      const filtered = assignedToMeItems.filter((i) => !shownIds.has(i.id));
      if (filtered.length > 0) {
        sections.push({ label: 'Assigned to Me', items: filtered });
        for (const i of filtered) shownIds.add(i.id);
      }
    }

    if (recentItems.length > 0) {
      const filtered = recentItems.filter((i) => !shownIds.has(i.id));
      if (filtered.length > 0) {
        sections.push({ label: 'Recent', items: filtered });
      }
    }

    return sections;
  }, [workingOnItems, assignedToMeItems, recentItems]);

  // Flat list for keyboard navigation in browse mode
  const browseFlat = useMemo(
    () => browseSections.flatMap((s) => s.items),
    [browseSections],
  );

  const navItems = isSearchMode ? searchResults : browseFlat;

  const getClient = useCallback(() => {
    if (!adoSettings) return null;
    return new AdoClient(
      adoSettings.organization,
      adoSettings.project,
      adoSettings.personalAccessToken ?? '',
    );
  }, [adoSettings]);

  // Debounced search — supports ID prefix (numeric) and title/assignedTo (text)
  useEffect(() => {
    searchCtsRef.current?.abort();

    const trimmed = searchText.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSelectedIndex(browseFlat.length > 0 ? 0 : -1);
      setStatusText('');
      return;
    }

    const isNumeric = /^\d+$/.test(trimmed);
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSelectedIndex(-1);
      setStatusText(isNumeric ? 'Type at least 2 digits' : 'Type at least 2 characters');
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
        if (!client) {
          setStatusText('ADO not configured');
          setIsSearching(false);
          return;
        }

        const items = isNumeric
          ? await searchWorkItemsByIdPrefix(client, trimmed)
          : await searchWorkItemsByText(client, trimmed);
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
  }, [searchText, getClient, browseFlat.length]);

  // Set initial selection when browse data loads
  useEffect(() => {
    if (!isSearchMode && browseFlat.length > 0) {
      setSelectedIndex(0);
    }
  }, [browseFlat.length, isSearchMode]);

  const selectAndClose = useCallback(
    async (id: number) => {
      try {
        await saveCurrentPosition();

        // Save as recent in settings
        const updatedRecent = [id, ...recentIds.filter((x) => x !== id)].slice(0, 20);
        try {
          const settings = await invoke<AppSettings>('load_settings');
          await invoke('save_settings', {
            settings: {
              ...settings,
              azureDevOps: { ...settings.azureDevOps, recentWorkItemIds: updatedRecent },
            },
          });
        } catch {
          /* best effort */
        }

        // Open a pop-out detail window for this work item
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        new WebviewWindow(`workitem-detail-${id}`, {
          url: `workitem-detail.html?id=${id}`,
          title: `Work Item #${id}`,
          width: 550,
          height: 700,
          center: true,
          decorations: false,
          resizable: true,
          focus: true,
          skipTaskbar: true,
        });
      } catch (err) {
        console.error('Failed to open detail window:', err);
      }
      getCurrentWindow().close().catch(console.debug); /* fire-and-forget */
    },
    [recentIds],
  );

  return {
    // State
    searchText,
    setSearchText,
    searchResults,
    selectedIndex,
    setSelectedIndex,
    statusText,
    isSearching,
    isSearchMode,
    isLoadingBrowse,
    browseSections,
    browseFlat,
    navItems,

    // Actions
    selectAndClose,
  };
}
