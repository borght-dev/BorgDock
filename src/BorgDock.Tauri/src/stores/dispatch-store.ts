import { create } from 'zustand';
import type {
  AgentProject,
  AgentThread,
  DispatchItem,
  ItemOverview,
  Overview,
} from '@/services/dispatch/types';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

/** Whether a source (Azure DevOps, a T3 host) answered its last poll. */
export interface SourceStatus {
  ok: boolean;
  /** When it last answered. */
  at: string | null;
  error: string | null;
}

export interface HostStatus extends SourceStatus {
  id: string;
  label: string;
}

export type DispatchViewMode = 'list' | 'board';

/** What the launch sheet opens on. */
export interface LaunchIntent {
  itemId: number;
  /** The slot to preselect, e.g. the one an item was dropped on. */
  slotId?: string;
}

/** What the launch sheet preselects: the choices made last time. */
export interface LaunchPreferences {
  model: string | null;
  /** Reasoning effort per model id. */
  efforts: Record<string, string>;
  mode: 'plan' | 'work';
}

const DEFAULT_LAUNCH_PREFERENCES: LaunchPreferences = { model: null, efforts: {}, mode: 'plan' };

const STORE_FILE = 'dispatch-state.json';
const HIDDEN_SUGGESTIONS_KEY = 'hiddenSuggestions';
const MANUAL_LINKS_KEY = 'manualLinks';
const VIEW_MODE_KEY = 'viewMode';
const LAUNCH_PREFERENCES_KEY = 'launchPreferences';

const NOT_SYNCED: SourceStatus = { ok: false, at: null, error: null };

interface DispatchState {
  items: DispatchItem[];
  threads: AgentThread[];
  projects: AgentProject[];
  ado: SourceStatus;
  hosts: HostStatus[];
  /** Ids of the suggestions hidden with "Keep" or "Hide this". Persisted. */
  hiddenSuggestions: Set<string>;
  /** Thread id to item id for links made or removed by hand. Persisted. */
  manualLinks: Map<string, number | null>;
  /** Built by `recomputeOverview` whenever one of its inputs changes. */
  overview: Overview | null;
  selectedItemId: number | null;
  viewMode: DispatchViewMode;
  searchQuery: string;
  /** An action is on its way to T3 or ADO; the buttons wait for it. */
  busy: boolean;
  /** The item the launch sheet is open for, or null while it is closed. */
  launch: LaunchIntent | null;
  launchPreferences: LaunchPreferences;

  setItems: (items: DispatchItem[], status: SourceStatus) => void;
  setAdoStatus: (status: SourceStatus) => void;
  /** Replace one host's threads and projects, keeping those of the other hosts. */
  setHostSnapshot: (hostId: string, threads: AgentThread[], projects: AgentProject[]) => void;
  /** Patch threads in place (detail that arrives after the snapshot). */
  patchThreads: (patches: ReadonlyMap<string, Partial<AgentThread>>) => void;
  setHostStatus: (status: HostStatus) => void;
  /** Drop the hosts that are no longer configured, with their threads and projects. */
  retainHosts: (hostIds: readonly string[]) => void;
  setOverview: (overview: Overview) => void;
  selectItem: (id: number | null) => void;
  setViewMode: (mode: DispatchViewMode) => void;
  setSearchQuery: (query: string) => void;
  setBusy: (busy: boolean) => void;
  openLaunch: (intent: LaunchIntent) => void;
  closeLaunch: () => void;
  /** Remember the model, effort and way of beginning for the next launch. */
  rememberLaunch: (model: string, effort: string | null, mode: string) => void;
  hideSuggestion: (suggestionId: string) => void;
  linkThread: (threadId: string, itemId: number | null) => void;
  restorePersisted: () => Promise<void>;
}

export const useDispatchStore = create<DispatchState>()((set, get) => ({
  items: [],
  threads: [],
  projects: [],
  ado: NOT_SYNCED,
  hosts: [],
  hiddenSuggestions: new Set(),
  manualLinks: new Map(),
  overview: null,
  selectedItemId: null,
  viewMode: 'list',
  searchQuery: '',
  busy: false,
  launch: null,
  launchPreferences: DEFAULT_LAUNCH_PREFERENCES,

  setItems: (items, status) => set({ items, ado: status }),

  setAdoStatus: (ado) => set({ ado }),

  setHostSnapshot: (hostId, threads, projects) =>
    set((state) => ({
      threads: [...state.threads.filter((t) => t.hostId !== hostId), ...threads],
      projects: [...state.projects.filter((p) => p.hostId !== hostId), ...projects],
    })),

  patchThreads: (patches) =>
    set((state) => ({
      threads: state.threads.map((thread) => {
        const patch = patches.get(thread.id);
        return patch ? { ...thread, ...patch } : thread;
      }),
    })),

  setHostStatus: (status) =>
    set((state) => {
      const available = status.ok;
      const flip = <T extends { hostId: string; available: boolean }>(entry: T): T =>
        entry.hostId === status.id && entry.available !== available
          ? { ...entry, available }
          : entry;
      return {
        hosts: [...state.hosts.filter((h) => h.id !== status.id), status],
        threads: state.threads.map(flip),
        projects: state.projects.map(flip),
      };
    }),

  retainHosts: (hostIds) =>
    set((state) => ({
      hosts: state.hosts.filter((h) => hostIds.includes(h.id)),
      threads: state.threads.filter((t) => hostIds.includes(t.hostId)),
      projects: state.projects.filter((p) => hostIds.includes(p.hostId)),
    })),

  setOverview: (overview) => set({ overview }),

  selectItem: (selectedItemId) => set({ selectedItemId }),

  setViewMode: (viewMode) => {
    set({ viewMode });
    persistToTauriStore(STORE_FILE, VIEW_MODE_KEY, viewMode).catch(() => {});
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setBusy: (busy) => set({ busy }),

  openLaunch: (launch) => set({ launch }),

  closeLaunch: () => set({ launch: null }),

  rememberLaunch: (model, effort, mode) => {
    const previous = get().launchPreferences;
    const launchPreferences: LaunchPreferences = {
      model,
      efforts: effort ? { ...previous.efforts, [model]: effort } : previous.efforts,
      // QA and Done are one-off handoffs, not how the next item should begin.
      mode: mode === 'plan' || mode === 'work' ? mode : previous.mode,
    };
    set({ launchPreferences });
    persistToTauriStore(STORE_FILE, LAUNCH_PREFERENCES_KEY, launchPreferences).catch(() => {});
  },

  hideSuggestion: (suggestionId) => {
    const hiddenSuggestions = new Set(get().hiddenSuggestions).add(suggestionId);
    set({ hiddenSuggestions });
    persistToTauriStore(STORE_FILE, HIDDEN_SUGGESTIONS_KEY, [...hiddenSuggestions]).catch(() => {});
  },

  linkThread: (threadId, itemId) => {
    const manualLinks = new Map(get().manualLinks).set(threadId, itemId);
    set({ manualLinks });
    persistToTauriStore(STORE_FILE, MANUAL_LINKS_KEY, [...manualLinks]).catch(() => {});
  },

  restorePersisted: async () => {
    const [hidden, links, viewMode, preferences] = await Promise.all([
      readFromTauriStore<string[]>(STORE_FILE, HIDDEN_SUGGESTIONS_KEY),
      readFromTauriStore<[string, number | null][]>(STORE_FILE, MANUAL_LINKS_KEY),
      readFromTauriStore<DispatchViewMode>(STORE_FILE, VIEW_MODE_KEY),
      readFromTauriStore<Partial<LaunchPreferences>>(STORE_FILE, LAUNCH_PREFERENCES_KEY),
    ]).catch(() => [undefined, undefined, undefined, undefined] as const);
    // What changed this session wins over what was stored.
    set((state) => ({
      hiddenSuggestions: new Set([...(hidden ?? []), ...state.hiddenSuggestions]),
      manualLinks: new Map([...(links ?? []), ...state.manualLinks]),
      viewMode: viewMode === 'board' || viewMode === 'list' ? viewMode : state.viewMode,
      launchPreferences: { ...DEFAULT_LAUNCH_PREFERENCES, ...preferences, ...launchPicks(state) },
    }));
  },
}));

/** The launch choices made this session, which win over the stored ones. */
function launchPicks(state: Pick<DispatchState, 'launchPreferences'>): Partial<LaunchPreferences> {
  return state.launchPreferences === DEFAULT_LAUNCH_PREFERENCES ? {} : state.launchPreferences;
}

/** The items waiting on you: the rail's count. */
export function selectWaitingCount(state: Pick<DispatchState, 'overview'>): number {
  return state.overview?.items.filter((o) => o.bay === 'waiting').length ?? 0;
}

export function selectItemOverview(
  state: Pick<DispatchState, 'overview'>,
  id: number | null,
): ItemOverview | null {
  if (id === null) return null;
  return state.overview?.items.find((o) => o.item.id === id) ?? null;
}
