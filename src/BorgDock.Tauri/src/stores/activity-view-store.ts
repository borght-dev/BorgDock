import { create } from 'zustand';
import type {
  ActivityReadState_Deserialize,
  ActivitySourceState_Serialize,
} from '@/generated/commands';
import * as api from '@/services/activity/api';
import { categoriesOf } from '@/services/activity/sources';
import type { ActivityCategoryGroup, ActivityEntry, ActivityRead } from '@/services/activity/types';

export type ActivityFilter = 'needs-you' | 'unread' | 'all';

/** One page is this long; "Show older" reads the next. */
export const PAGE_SIZE = 500;

export interface UndoStep {
  label: string;
  states: ActivityReadState_Deserialize[];
}

interface ActivityViewState {
  filter: ActivityFilter;
  group: ActivityCategoryGroup | null;
  sourceId: string | null;
  search: string;
  entries: ActivityEntry[];
  total: number;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  sources: ActivitySourceState_Serialize[];
  selectedId: string | null;
  /** The selected row shows its detail. */
  expandedId: string | null;
  /** `<day>|<entity key>` groups whose folded updates are shown. */
  openGroups: ReadonlySet<string>;
  undo: UndoStep[];
  setFilter: (filter: ActivityFilter) => void;
  setGroup: (group: ActivityCategoryGroup | null) => void;
  setSource: (sourceId: string | null) => void;
  setSearch: (search: string) => void;
  select: (id: string | null) => void;
  /** Show one entry: every filter cleared, the page read again, the entry selected and open. */
  reveal: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => void;
  toggleGroup: (key: string) => void;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  loadSources: () => Promise<void>;
  /** Set read state and keep the previous states for `z`. */
  mark: (
    ids: string[],
    read: ActivityRead,
    label: string,
    reason?: 'user' | 'bulk',
  ) => Promise<void>;
  /** "Mark shown read": the ids loaded in this filter now, never a time. */
  markShownRead: () => Promise<void>;
  undoLast: () => Promise<void>;
  clearSource: (sourceId: string | null) => Promise<void>;
}

let generation = 0;

function queryOf(state: ActivityViewState) {
  return {
    filter: state.filter,
    categories: state.group ? categoriesOf(state.group) : [],
    sourceIds: state.sourceId ? [state.sourceId] : [],
    entityKeys: [],
    search: state.search.trim() || null,
    includeDismissed: false,
    limit: PAGE_SIZE,
    before: null,
  };
}

export const useActivityViewStore = create<ActivityViewState>()((set, get) => ({
  filter: 'unread',
  group: null,
  sourceId: null,
  search: '',
  entries: [],
  total: 0,
  loading: false,
  loaded: false,
  error: null,
  sources: [],
  selectedId: null,
  expandedId: null,
  openGroups: new Set(),
  undo: [],

  setFilter: (filter) => {
    set({ filter });
    void get().refresh();
  },
  setGroup: (group) => {
    set({ group });
    void get().refresh();
  },
  setSource: (sourceId) => {
    set({ sourceId });
    void get().refresh();
  },
  setSearch: (search) => {
    set({ search });
    void get().refresh();
  },
  select: (selectedId) => set({ selectedId }),
  reveal: async (id) => {
    set({ filter: 'all', group: null, sourceId: null, search: '' });
    await get().refresh();
    set({ selectedId: id, expandedId: id });
  },
  toggleExpanded: (id) =>
    set((state) => ({ expandedId: state.expandedId === id ? null : id, selectedId: id })),
  toggleGroup: (key) =>
    set((state) => {
      const openGroups = new Set(state.openGroups);
      if (openGroups.has(key)) openGroups.delete(key);
      else openGroups.add(key);
      return { openGroups };
    }),

  refresh: async () => {
    const current = ++generation;
    set({ loading: true });
    try {
      const page = await api.listEntries(queryOf(get()));
      if (current !== generation) return;
      const ids = new Set(page.entries.map((entry) => entry.id));
      const state = get();
      // A row that left the filter hands the selection to the row after it.
      let selectedId = state.selectedId;
      if (selectedId && !ids.has(selectedId)) {
        const at = state.entries.findIndex((entry) => entry.id === selectedId);
        selectedId =
          state.entries.slice(at + 1).find((entry) => ids.has(entry.id))?.id ??
          page.entries.at(-1)?.id ??
          null;
      }
      set({
        entries: page.entries,
        total: page.total,
        loading: false,
        loaded: true,
        error: null,
        selectedId,
      });
    } catch (error) {
      if (current !== generation) return;
      set({
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  loadOlder: async () => {
    const state = get();
    const last = state.entries.at(-1);
    if (!last || state.entries.length >= state.total) return;
    const current = generation;
    const page = await api.listEntries({
      ...queryOf(state),
      before: { observedAt: last.observedAt, id: last.id },
    });
    if (current !== generation) return;
    set({ entries: [...get().entries, ...page.entries], total: page.total });
  },

  loadSources: async () => {
    try {
      set({ sources: await api.listSources() });
    } catch {
      // The source menu stays as it was.
    }
  },

  mark: async (ids, read, label, reason = 'user') => {
    if (ids.length === 0) return;
    const result = await api.mark({
      ids,
      entityKeys: [],
      before: null,
      read,
      reason: read === 'unread' ? null : reason,
    });
    if (result.previous.length > 0) {
      set((state) => ({ undo: [...state.undo.slice(-19), { label, states: result.previous }] }));
    }
    await get().refresh();
  },

  markShownRead: async () => {
    const ids = get()
      .entries.filter((entry) => entry.read === 'unread')
      .map((entry) => entry.id);
    await get().mark(ids, 'read', `Marked ${ids.length} read`, 'bulk');
  },

  undoLast: async () => {
    const step = get().undo.at(-1);
    if (!step) return;
    set((state) => ({ undo: state.undo.slice(0, -1) }));
    await api.restore(step.states);
    await get().refresh();
  },

  clearSource: async (sourceId) => {
    await api.clear(sourceId);
    set({ undo: [] });
    await get().refresh();
  },
}));
