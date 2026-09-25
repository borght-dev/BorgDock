import { create } from 'zustand';
import type { WorktreeBranchMapping } from '@/hooks/useWorktreeMap';
import type { FocusFilter } from '@/services/focus-bucket';
import type { PrGroupBy } from '@/services/pr-grouping';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

export type ActiveSection = 'prs' | 'focus' | 'workitems' | 'worktrees';

/** Sections in rail order; keys `1`–`4` pick them by position. */
export const SECTION_ORDER: readonly ActiveSection[] = ['focus', 'prs', 'workitems', 'worktrees'];

function isActiveSection(value: unknown): value is ActiveSection {
  return typeof value === 'string' && (SECTION_ORDER as readonly string[]).includes(value);
}

/** Tabs of the PR detail view, for `pr-detail` views that open on a specific tab. */
export type PrDetailTab = 'overview' | 'commits' | 'files' | 'checks' | 'discussion';

/**
 * What the main window shows. `list` is the section list (`activeSection`
 * picks which one); the detail views are pushed on top of it and popped with
 * Back, `Esc`, `Alt+Left` or the mouse back button.
 */
export type MainView =
  | { kind: 'list' }
  | { kind: 'pr-detail'; owner: string; repo: string; number: number; initialTab?: PrDetailTab }
  | { kind: 'work-item-detail'; id: number };

const LIST_VIEW: MainView = { kind: 'list' };

/** Tauri-store key of the Focus snoozes ("Later" on the Board). */
export const FOCUS_SNOOZES_STORE_KEY = 'focusSnoozes';

/** Snoozes that have not run out yet. */
function liveSnoozes(snoozes: Record<string, number>, now: number): Record<string, number> {
  const live: Record<string, number> = {};
  for (const [key, until] of Object.entries(snoozes)) {
    if (typeof until === 'number' && until > now) live[key] = until;
  }
  return live;
}

function persistSnoozes(snoozes: Record<string, number>) {
  persistToTauriStore('ui-state.json', FOCUS_SNOOZES_STORE_KEY, snoozes).catch(() => {});
}

interface UiState {
  activeSection: ActiveSection;
  selectedPrNumber: number | null;
  /**
   * The selected PR as `owner/repo#number` (Workbench rows). Numbers collide
   * across repositories, so the Workbench list selects by key; the tab
   * layout still reads `selectedPrNumber`, which `selectPrKey` sets as well.
   */
  selectedPrKey: string | null;
  workItemsSelectedId: number | null;
  expandedRepoGroups: Set<string>;
  isDragging: boolean;
  pendingWorkItemId: number | null;
  /** Maps branch name (lowercase) → worktree slot info */
  worktreeBranchMap: Map<string, WorktreeBranchMapping>;
  prGroupBy: PrGroupBy;
  _hasUserNavigated: boolean;
  /**
   * Navigation stack of the main window. Always starts with the list view and
   * never drops below it. Not persisted: a restart opens on the list.
   */
  viewStack: MainView[];
  /** The Focus count strip's filter. Session state, not persisted. */
  focusFilter: FocusFilter;
  /**
   * PRs snoozed with "Later" on the Focus board, `owner/repo#number` →
   * snoozed until (epoch ms). `bucketFor` moves a snoozed PR from Needs
   * you to Waiting until then. Persisted, expired entries dropped.
   */
  focusSnoozes: Record<string, number>;

  setActiveSection: (section: ActiveSection) => void;
  /** Select by number (tab layout). Clears the key selection. */
  selectPr: (prNumber: number | null) => void;
  /** Select one PR by `owner/repo#number` and its number (Workbench rows). */
  selectPrKey: (key: string | null, prNumber: number | null) => void;
  setWorkItemsSelectedId: (id: number | null) => void;
  toggleRepoGroup: (repoKey: string) => void;
  collapseAllRepoGroups: () => void;
  setDragging: (dragging: boolean) => void;
  setPendingWorkItemId: (id: number | null) => void;
  setWorktreeBranchMap: (map: Map<string, WorktreeBranchMapping>) => void;
  setPrGroupBy: (groupBy: PrGroupBy) => void;
  restorePersistedSection: () => void;
  /** Push a view on top of the stack. */
  pushView: (view: MainView) => void;
  /** Pop the top view. No-op when only the list is left. */
  popView: () => void;
  /**
   * Replace the top detail view. The list always stays at the bottom: at
   * depth 1 a detail view is pushed instead, and replacing with the list view
   * returns to the list.
   */
  replaceView: (view: MainView) => void;
  setFocusFilter: (filter: FocusFilter) => void;
  /** Snooze a PR until `until` (epoch ms). */
  snoozeFocusPr: (key: string, until: number) => void;
  unsnoozeFocusPr: (key: string) => void;
  /** Read the persisted snoozes back (called by `restorePersistedSection`). */
  restoreFocusSnoozes: () => void;
}

/** The view the main window is showing. */
export const selectTopView = (s: Pick<UiState, 'viewStack'>): MainView =>
  s.viewStack[s.viewStack.length - 1] ?? LIST_VIEW;

/** Number of views on the stack; 1 means the list is showing. */
export const selectViewDepth = (s: Pick<UiState, 'viewStack'>): number => s.viewStack.length;

export const useUiStore = create<UiState>()((set, get) => ({
  activeSection: 'focus',
  selectedPrNumber: null,
  selectedPrKey: null,
  workItemsSelectedId: null,
  expandedRepoGroups: new Set<string>(),
  isDragging: false,
  pendingWorkItemId: null,
  worktreeBranchMap: new Map(),
  prGroupBy: 'author',
  _hasUserNavigated: false,
  viewStack: [LIST_VIEW],
  focusFilter: 'all',
  focusSnoozes: {},

  setActiveSection: (section) => {
    set({ activeSection: section, _hasUserNavigated: true });
    persistToTauriStore('ui-state.json', 'activeSection', section).catch((err) =>
      console.warn('Failed to persist activeSection:', err),
    );
  },

  selectPr: (prNumber) => set({ selectedPrNumber: prNumber, selectedPrKey: null }),

  selectPrKey: (key, prNumber) => set({ selectedPrKey: key, selectedPrNumber: prNumber }),

  setWorkItemsSelectedId: (workItemsSelectedId) => set({ workItemsSelectedId }),

  toggleRepoGroup: (repoKey) =>
    set((state) => {
      const next = new Set(state.expandedRepoGroups);
      if (next.has(repoKey)) {
        next.delete(repoKey);
      } else {
        next.add(repoKey);
      }
      return { expandedRepoGroups: next };
    }),

  collapseAllRepoGroups: () => set({ expandedRepoGroups: new Set() }),

  setDragging: (dragging) => set({ isDragging: dragging }),

  setPendingWorkItemId: (id) => set({ pendingWorkItemId: id }),

  setWorktreeBranchMap: (map) => set({ worktreeBranchMap: map }),

  setPrGroupBy: (prGroupBy) => {
    set({ prGroupBy });
    persistToTauriStore('ui-state.json', 'prGroupBy', prGroupBy).catch(() => {});
  },

  restorePersistedSection: () => {
    get().restoreFocusSnoozes();
    if (get()._hasUserNavigated) return;
    Promise.all([
      readFromTauriStore<ActiveSection>('ui-state.json', 'activeSection'),
      readFromTauriStore<PrGroupBy>('ui-state.json', 'prGroupBy'),
    ])
      .then(([section, groupBy]) => {
        if (get()._hasUserNavigated) return;
        const preferences: Partial<UiState> = {};
        if (isActiveSection(section)) {
          preferences.activeSection = section;
        }
        if (groupBy && (groupBy === 'repo' || groupBy === 'author' || groupBy === 'status')) {
          preferences.prGroupBy = groupBy;
        }
        set(preferences);
      })
      .catch((err) => console.warn('Failed to restore persisted UI preferences:', err));
  },

  pushView: (view) => set((state) => ({ viewStack: [...state.viewStack, view] })),

  popView: () =>
    set((state) =>
      state.viewStack.length > 1 ? { viewStack: state.viewStack.slice(0, -1) } : state,
    ),

  replaceView: (view) =>
    set((state) => {
      if (view.kind === 'list') return { viewStack: [LIST_VIEW] };
      if (state.viewStack.length <= 1) return { viewStack: [...state.viewStack, view] };
      return { viewStack: [...state.viewStack.slice(0, -1), view] };
    }),

  setFocusFilter: (focusFilter) => set({ focusFilter }),

  snoozeFocusPr: (key, until) => {
    const focusSnoozes = { ...liveSnoozes(get().focusSnoozes, Date.now()), [key]: until };
    set({ focusSnoozes });
    persistSnoozes(focusSnoozes);
  },

  unsnoozeFocusPr: (key) => {
    if (!(key in get().focusSnoozes)) return;
    const focusSnoozes = { ...get().focusSnoozes };
    delete focusSnoozes[key];
    set({ focusSnoozes });
    persistSnoozes(focusSnoozes);
  },

  restoreFocusSnoozes: () => {
    Promise.resolve()
      .then(() =>
        readFromTauriStore<Record<string, number>>('ui-state.json', FOCUS_SNOOZES_STORE_KEY),
      )
      .then((stored) => {
        if (!stored || typeof stored !== 'object') return;
        // Snoozes made this session win over the stored ones.
        set((state) => ({
          focusSnoozes: { ...liveSnoozes(stored, Date.now()), ...state.focusSnoozes },
        }));
      })
      .catch(() => {});
  },
}));
