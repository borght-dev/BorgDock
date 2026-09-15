import { create } from 'zustand';
import type { WorktreeBranchMapping } from '@/hooks/useWorktreeMap';
import type { PrGroupBy } from '@/services/pr-grouping';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

export type ActiveSection = 'prs' | 'focus' | 'workitems';

interface UiState {
  activeSection: ActiveSection;
  selectedPrNumber: number | null;
  workItemsSelectedId: number | null;
  expandedRepoGroups: Set<string>;
  isDragging: boolean;
  pendingWorkItemId: number | null;
  /** Maps branch name (lowercase) → worktree slot info */
  worktreeBranchMap: Map<string, WorktreeBranchMapping>;
  prGroupBy: PrGroupBy;
  _hasUserNavigated: boolean;

  setActiveSection: (section: ActiveSection) => void;
  selectPr: (prNumber: number | null) => void;
  setWorkItemsSelectedId: (id: number | null) => void;
  toggleRepoGroup: (repoKey: string) => void;
  collapseAllRepoGroups: () => void;
  setDragging: (dragging: boolean) => void;
  setPendingWorkItemId: (id: number | null) => void;
  setWorktreeBranchMap: (map: Map<string, WorktreeBranchMapping>) => void;
  setPrGroupBy: (groupBy: PrGroupBy) => void;
  restorePersistedSection: () => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  activeSection: 'focus',
  selectedPrNumber: null,
  workItemsSelectedId: null,
  expandedRepoGroups: new Set<string>(),
  isDragging: false,
  pendingWorkItemId: null,
  worktreeBranchMap: new Map(),
  prGroupBy: 'author',
  _hasUserNavigated: false,

  setActiveSection: (section) => {
    set({ activeSection: section, _hasUserNavigated: true });
    persistToTauriStore('ui-state.json', 'activeSection', section).catch((err) =>
      console.warn('Failed to persist activeSection:', err),
    );
  },

  selectPr: (prNumber) => set({ selectedPrNumber: prNumber }),

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
    if (get()._hasUserNavigated) return;
    Promise.all([
      readFromTauriStore<ActiveSection>('ui-state.json', 'activeSection'),
      readFromTauriStore<PrGroupBy>('ui-state.json', 'prGroupBy'),
    ])
      .then(([section, groupBy]) => {
        if (get()._hasUserNavigated) return;
        const preferences: Partial<UiState> = {};
        if (section && (section === 'prs' || section === 'focus' || section === 'workitems')) {
          preferences.activeSection = section;
        }
        if (groupBy && (groupBy === 'repo' || groupBy === 'author' || groupBy === 'status')) {
          preferences.prGroupBy = groupBy;
        }
        set(preferences);
      })
      .catch((err) => console.warn('Failed to restore persisted UI preferences:', err));
  },
}));
