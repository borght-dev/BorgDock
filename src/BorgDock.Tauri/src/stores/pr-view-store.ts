import { create } from 'zustand';
import { createLogger } from '@/services/logger';
import { DEFAULT_DISPLAY, type PrDisplay, sanitizeDisplay } from '@/services/pr-list/display';
import {
  isViewEdited,
  newViewId,
  type SavedPrView,
  sanitizeSavedViews,
} from '@/services/pr-list/facets';
import { isGroupCollapsed } from '@/services/pr-list/groups';
import type { PrViewKey } from '@/services/pr-list/model';
import { settleChange } from '@/services/pr-list/pending-change';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

const log = createLogger('pr-view-store');

/** `ui-state.json` keys. */
export const PR_DISPLAY_STORE_KEY = 'prListDisplay';
export const PR_SAVED_VIEWS_STORE_KEY = 'prSavedViews';
export const PR_ACTIVE_VIEW_STORE_KEY = 'prActiveView';
export const PR_CI_SUMMARY_STORE_KEY = 'prCiSummary';

function persist(key: string, value: unknown) {
  persistToTauriStore('ui-state.json', key, value).catch((err) =>
    log.debug('failed to persist', { key, error: String(err) }),
  );
}

interface PrViewState {
  /** What the list shows now: the active saved view's display (maybe edited), else `baseDisplay`. */
  display: PrDisplay;
  /** The display of the built-in tabs, remembered across launches. */
  baseDisplay: PrDisplay;
  savedViews: SavedPrView[];
  /** The saved view on screen; null while a built-in tab is. */
  activeViewId: string | null;
  /** The shared CI failures summary above the list. */
  showCiSummary: boolean;
  /**
   * Quiet groups opened by hand while "Collapse groups with nothing for you"
   * is on. Session state, like `ui-store.collapsedGroups`.
   */
  expandedGroups: Set<string>;

  setDisplay: (patch: Partial<PrDisplay>) => void;
  resetDisplay: () => void;
  setShowCiSummary: (show: boolean) => void;
  /** Show a built-in tab: leaving a saved view drops its query and display. */
  showBuiltInView: (view: PrViewKey) => void;
  showSavedView: (id: string) => void;
  /** Save the list as it is now as a new view, and show it. Returns its id. */
  saveView: (name: string) => string;
  /** Write the list as it is now into the active saved view. */
  updateActiveView: () => void;
  /** Put the active saved view back the way it was saved. */
  revertActiveView: () => void;
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
  restore: () => Promise<void>;
}

/** The list's current filter, query and display, as a saved view would keep them. */
function currentList(display: PrDisplay) {
  const { filter, searchQuery } = usePrStore.getState();
  return { filter, query: searchQuery, display };
}

export const usePrViewStore = create<PrViewState>()((set, get) => ({
  display: DEFAULT_DISPLAY,
  baseDisplay: DEFAULT_DISPLAY,
  savedViews: [],
  activeViewId: null,
  showCiSummary: true,
  expandedGroups: new Set(),

  setDisplay: (patch) => {
    const display = { ...get().display, ...patch };
    if (get().activeViewId) {
      set({ display });
      return;
    }
    set({ display, baseDisplay: display });
    persist(PR_DISPLAY_STORE_KEY, display);
  },

  resetDisplay: () =>
    get().setDisplay({ ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns] }),

  setShowCiSummary: (showCiSummary) => {
    set({ showCiSummary });
    persist(PR_CI_SUMMARY_STORE_KEY, showCiSummary);
  },

  showBuiltInView: (view) => {
    const pr = usePrStore.getState();
    if (get().activeViewId) {
      set({ activeViewId: null, display: get().baseDisplay });
      persist(PR_ACTIVE_VIEW_STORE_KEY, null);
      pr.setSearchQuery('');
    }
    pr.setFilter(view);
  },

  showSavedView: (id) => {
    const view = get().savedViews.find((v) => v.id === id);
    if (!view) return;
    set({ activeViewId: id, display: view.display });
    persist(PR_ACTIVE_VIEW_STORE_KEY, id);
    const pr = usePrStore.getState();
    pr.setFilter(view.filter);
    pr.setSearchQuery(view.query);
  },

  saveView: (name) => {
    settleChange();
    const view: SavedPrView = {
      id: newViewId(),
      name: name.trim() || 'Untitled view',
      ...currentList(get().display),
    };
    const savedViews = [...get().savedViews, view];
    set({ savedViews, activeViewId: view.id });
    persist(PR_SAVED_VIEWS_STORE_KEY, savedViews);
    persist(PR_ACTIVE_VIEW_STORE_KEY, view.id);
    return view.id;
  },

  updateActiveView: () => {
    settleChange();
    const id = get().activeViewId;
    if (!id) return;
    const savedViews = get().savedViews.map((v) =>
      v.id === id ? { ...v, ...currentList(get().display) } : v,
    );
    set({ savedViews });
    persist(PR_SAVED_VIEWS_STORE_KEY, savedViews);
  },

  revertActiveView: () => {
    const id = get().activeViewId;
    if (id) get().showSavedView(id);
  },

  renameView: (id, name) => {
    if (!name.trim()) return;
    const savedViews = get().savedViews.map((v) => (v.id === id ? { ...v, name: name.trim() } : v));
    set({ savedViews });
    persist(PR_SAVED_VIEWS_STORE_KEY, savedViews);
  },

  deleteView: (id) => {
    const savedViews = get().savedViews.filter((v) => v.id !== id);
    const wasActive = get().activeViewId === id;
    set({ savedViews });
    persist(PR_SAVED_VIEWS_STORE_KEY, savedViews);
    if (wasActive) get().showBuiltInView('all');
  },

  restore: async () => {
    const [display, views, active, ciSummary] = await Promise.all([
      readFromTauriStore<unknown>('ui-state.json', PR_DISPLAY_STORE_KEY),
      readFromTauriStore<unknown>('ui-state.json', PR_SAVED_VIEWS_STORE_KEY),
      readFromTauriStore<unknown>('ui-state.json', PR_ACTIVE_VIEW_STORE_KEY),
      readFromTauriStore<unknown>('ui-state.json', PR_CI_SUMMARY_STORE_KEY),
    ]);
    const baseDisplay = display === undefined ? get().baseDisplay : sanitizeDisplay(display);
    const savedViews = sanitizeSavedViews(views);
    set({
      baseDisplay,
      display: get().activeViewId ? get().display : baseDisplay,
      savedViews,
      ...(typeof ciSummary === 'boolean' ? { showCiSummary: ciSummary } : {}),
    });
    if (typeof active === 'string' && savedViews.some((v) => v.id === active)) {
      get().showSavedView(active);
    }
  },
}));

/** The active saved view, and whether the list differs from it. */
export function useActiveSavedView(): { view: SavedPrView | null; edited: boolean } {
  const view = usePrViewStore((s) => s.savedViews.find((v) => v.id === s.activeViewId) ?? null);
  const display = usePrViewStore((s) => s.display);
  const filter = usePrStore((s) => s.filter);
  const query = usePrStore((s) => s.searchQuery);
  return { view, edited: view ? isViewEdited(view, { filter, query, display }) : false };
}

/** Whether a group is folded now (`isGroupCollapsed` with the stores' state). */
export function prGroupCollapsed(group: { key: string; quiet: boolean }): boolean {
  return isGroupCollapsed(
    group,
    useUiStore.getState().collapsedGroups,
    usePrViewStore.getState().expandedGroups,
    usePrViewStore.getState().display.collapseQuiet,
  );
}

/**
 * Fold or unfold a list group. A quiet group folded by "collapse quiet
 * groups" opens through `expandedGroups`; anything else goes through
 * `ui-store.collapsedGroups`.
 */
export function togglePrGroup(group: { key: string; quiet: boolean }): void {
  const ui = useUiStore.getState();
  const view = usePrViewStore.getState();
  const expanded = new Set(view.expandedGroups);
  if (prGroupCollapsed(group)) {
    if (ui.collapsedGroups.has(group.key)) ui.toggleRepoGroup(group.key);
    if (group.quiet && view.display.collapseQuiet) expanded.add(group.key);
  } else {
    ui.toggleRepoGroup(group.key);
    expanded.delete(group.key);
  }
  usePrViewStore.setState({ expandedGroups: expanded });
}
