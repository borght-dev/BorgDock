import { create } from 'zustand';
import type {
  AgentProject,
  AgentThread,
  DispatchItem,
  ItemOverview,
  KnownPullRequest,
  Overview,
  SyncScope,
} from '@/services/dispatch/types';
import { type BriefFilter, needingYou } from '@/services/dispatch/walk';
import { shareEntities, shareValue } from '@/utils/structural-sharing';
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

/** `walk`: one section per ADO state, in the order they are checked. */
export type DispatchViewMode = 'walk' | 'list' | 'board';

const VIEW_MODES: readonly DispatchViewMode[] = ['walk', 'list', 'board'];

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

/** `sync`: one agent brings items up to date. `suggest`: one agent recommends the next item. */
export type RunKind = 'sync' | 'suggest';

/** An agent Dispatch started on many items, or on none. */
export interface AgentRun {
  threadId: string;
  kind: RunKind;
  /** What a sync was started for; absent on runs from before scopes. */
  scope?: SyncScope['kind'];
  /** The states of the items a sync was given; empty for a suggestion. */
  states: string[];
  itemIds: number[];
  /** Each item's state when the run started, by id: what tells a move apart. */
  fromStates?: Record<string, string>;
  /** The slot it runs in, by name. */
  slot: string;
  startedAt: string;
  /** Started by the schedule, not by hand. */
  scheduled?: boolean;
}

/** What the run sheet opens for. */
export type RunIntent = { kind: 'sync'; scope: SyncScope } | { kind: 'suggest' };

/** The slot, model and effort of the last run: what a scheduled run starts with. */
export interface RunChoice {
  slotId: string | null;
  model: string | null;
  effort: string | null;
}

const NO_RUN_CHOICE: RunChoice = { slotId: null, model: null, effort: null };
/** Runs older than this are forgotten. */
const RUN_MEMORY_MS = 7 * 86_400_000;

const STORE_FILE = 'dispatch-state.json';
const HIDDEN_SUGGESTIONS_KEY = 'hiddenSuggestions';
const MANUAL_LINKS_KEY = 'manualLinks';
// The walk became the default; layouts picked before it are not carried over.
const VIEW_MODE_KEY = 'layout';
const LAUNCH_PREFERENCES_KEY = 'launchPreferences';
const RUNS_KEY = 'runs';
const RUN_CHOICE_KEY = 'runChoice';
const SCHEDULE_LAST_RUN_KEY = 'scheduleLastRun';
const REPOSITORIES_KEY = 'linkedRepositories';

const NOT_SYNCED: SourceStatus = { ok: false, at: null, error: null };

interface DispatchState {
  items: DispatchItem[];
  threads: AgentThread[];
  projects: AgentProject[];
  /** The pull requests ADO links on the items, read from GitHub (`linked-prs.ts`). */
  linkedPullRequests: KnownPullRequest[];
  /** ADO's id of a linked pull request's repository to its GitHub `owner/name`. Persisted. */
  linkedRepositories: Record<string, string>;
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
  /** The briefing count the walk, list and board are narrowed to; null shows every item. */
  briefFilter: BriefFilter | null;
  /** An action is on its way to T3 or ADO; the buttons wait for it. */
  busy: boolean;
  /** The item the launch sheet is open for, or null while it is closed. */
  launch: LaunchIntent | null;
  launchPreferences: LaunchPreferences;
  /** Newest first. Persisted. */
  runs: AgentRun[];
  /** What the run sheet is open for, or null while it is closed. */
  runSheet: RunIntent | null;
  runChoice: RunChoice;
  /** The day (`YYYY-MM-DD`, local) the scheduled sync last ran. Persisted. */
  scheduleLastRun: string | null;

  setItems: (items: DispatchItem[], status: SourceStatus) => void;
  setLinkedPullRequests: (
    pullRequests: KnownPullRequest[],
    repositories: Record<string, string>,
  ) => void;
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
  setBriefFilter: (filter: BriefFilter | null) => void;
  setBusy: (busy: boolean) => void;
  openLaunch: (intent: LaunchIntent) => void;
  closeLaunch: () => void;
  /** Remember the model, effort and way of beginning for the next launch. */
  rememberLaunch: (model: string, effort: string | null, mode: string) => void;
  hideSuggestion: (suggestionId: string) => void;
  addRun: (run: AgentRun) => void;
  dismissRun: (threadId: string) => void;
  openRunSheet: (intent: RunIntent) => void;
  closeRunSheet: () => void;
  rememberRunChoice: (choice: RunChoice) => void;
  markScheduleRun: (day: string) => void;
  linkThread: (threadId: string, itemId: number | null) => void;
  restorePersisted: () => Promise<void>;
}

export const useDispatchStore = create<DispatchState>()((set, get) => ({
  items: [],
  threads: [],
  projects: [],
  linkedPullRequests: [],
  linkedRepositories: {},
  ado: NOT_SYNCED,
  hosts: [],
  hiddenSuggestions: new Set(),
  manualLinks: new Map(),
  overview: null,
  selectedItemId: null,
  viewMode: 'walk',
  searchQuery: '',
  briefFilter: null,
  busy: false,
  launch: null,
  launchPreferences: DEFAULT_LAUNCH_PREFERENCES,
  runs: [],
  runSheet: null,
  runChoice: NO_RUN_CHOICE,
  scheduleLastRun: null,

  setItems: (items, status) =>
    set((state) => ({ items: shareEntities(state.items, items, (item) => item.id), ado: status })),

  setLinkedPullRequests: (linkedPullRequests, linkedRepositories) => {
    const learned = JSON.stringify(linkedRepositories) !== JSON.stringify(get().linkedRepositories);
    set({ linkedPullRequests, linkedRepositories });
    if (learned) {
      persistToTauriStore(STORE_FILE, REPOSITORIES_KEY, linkedRepositories).catch(() => {});
    }
  },

  setAdoStatus: (ado) => set({ ado }),

  setHostSnapshot: (hostId, threads, projects) =>
    set((state) => ({
      threads: shareEntities(
        state.threads,
        [...state.threads.filter((t) => t.hostId !== hostId), ...threads],
        (thread) => thread.id,
      ),
      projects: shareEntities(
        state.projects,
        [...state.projects.filter((p) => p.hostId !== hostId), ...projects],
        (project) => project.id,
      ),
    })),

  patchThreads: (patches) =>
    set((state) => ({
      threads: state.threads.map((thread) => {
        const patch = patches.get(thread.id);
        return patch ? shareValue(thread, { ...thread, ...patch }) : thread;
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
        threads: shareEntities(state.threads, state.threads.map(flip), (thread) => thread.id),
        projects: shareEntities(state.projects, state.projects.map(flip), (project) => project.id),
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

  setBriefFilter: (briefFilter) => set({ briefFilter }),

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

  addRun: (run) => {
    const runs = [run, ...get().runs.filter((r) => r.threadId !== run.threadId)];
    set({ runs });
    persistToTauriStore(STORE_FILE, RUNS_KEY, runs).catch(() => {});
  },

  dismissRun: (threadId) => {
    const runs = get().runs.filter((r) => r.threadId !== threadId);
    set({ runs });
    persistToTauriStore(STORE_FILE, RUNS_KEY, runs).catch(() => {});
  },

  openRunSheet: (runSheet) => set({ runSheet }),

  closeRunSheet: () => set({ runSheet: null }),

  rememberRunChoice: (runChoice) => {
    set({ runChoice });
    persistToTauriStore(STORE_FILE, RUN_CHOICE_KEY, runChoice).catch(() => {});
  },

  markScheduleRun: (scheduleLastRun) => {
    set({ scheduleLastRun });
    persistToTauriStore(STORE_FILE, SCHEDULE_LAST_RUN_KEY, scheduleLastRun).catch(() => {});
  },

  linkThread: (threadId, itemId) => {
    const manualLinks = new Map(get().manualLinks).set(threadId, itemId);
    set({ manualLinks });
    persistToTauriStore(STORE_FILE, MANUAL_LINKS_KEY, [...manualLinks]).catch(() => {});
  },

  restorePersisted: async () => {
    const [hidden, links, viewMode, preferences, runs, runChoice, lastRun, repositories] =
      await Promise.all([
        readFromTauriStore<string[]>(STORE_FILE, HIDDEN_SUGGESTIONS_KEY),
        readFromTauriStore<[string, number | null][]>(STORE_FILE, MANUAL_LINKS_KEY),
        readFromTauriStore<DispatchViewMode>(STORE_FILE, VIEW_MODE_KEY),
        readFromTauriStore<Partial<LaunchPreferences>>(STORE_FILE, LAUNCH_PREFERENCES_KEY),
        readFromTauriStore<AgentRun[]>(STORE_FILE, RUNS_KEY),
        readFromTauriStore<RunChoice>(STORE_FILE, RUN_CHOICE_KEY),
        readFromTauriStore<string>(STORE_FILE, SCHEDULE_LAST_RUN_KEY),
        readFromTauriStore<Record<string, string>>(STORE_FILE, REPOSITORIES_KEY),
      ]).catch(() => Array.from({ length: 8 }, () => undefined) as never[]);
    const recent = (runs ?? []).filter(
      (run) => Date.now() - Date.parse(run.startedAt) < RUN_MEMORY_MS,
    );
    // What changed this session wins over what was stored.
    set((state) => ({
      hiddenSuggestions: new Set([...(hidden ?? []), ...state.hiddenSuggestions]),
      manualLinks: new Map([...(links ?? []), ...state.manualLinks]),
      viewMode: viewMode && VIEW_MODES.includes(viewMode) ? viewMode : state.viewMode,
      launchPreferences: { ...DEFAULT_LAUNCH_PREFERENCES, ...preferences, ...launchPicks(state) },
      runs: [
        ...state.runs,
        ...recent.filter((run) => !state.runs.some((r) => r.threadId === run.threadId)),
      ],
      runChoice: state.runChoice === NO_RUN_CHOICE ? (runChoice ?? NO_RUN_CHOICE) : state.runChoice,
      scheduleLastRun: state.scheduleLastRun ?? lastRun ?? null,
      linkedRepositories: { ...repositories, ...state.linkedRepositories },
    }));
  },
}));

/** The launch choices made this session, which win over the stored ones. */
function launchPicks(state: Pick<DispatchState, 'launchPreferences'>): Partial<LaunchPreferences> {
  return state.launchPreferences === DEFAULT_LAUNCH_PREFERENCES ? {} : state.launchPreferences;
}

/** The items that need you now, as Focus counts them: the rail's count. */
export function selectWaitingCount(state: Pick<DispatchState, 'overview'>): number {
  return needingYou(state.overview?.items ?? []).length;
}

export function selectItemOverview(
  state: Pick<DispatchState, 'overview'>,
  id: number | null,
): ItemOverview | null {
  if (id === null) return null;
  return state.overview?.items.find((o) => o.item.id === id) ?? null;
}
