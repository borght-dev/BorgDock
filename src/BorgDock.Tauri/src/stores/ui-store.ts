import { create } from 'zustand';
import type { WorktreeBranchMapping } from '@/hooks/useWorktreeMap';
import type { PrGroupBy } from '@/services/pr-grouping';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

export type ActiveSection = 'prs' | 'focus' | 'workitems';
export type PrDensity = 'compact' | 'normal';

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
  prDensity: PrDensity;
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
  setPrDensity: (density: PrDensity) => void;
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
  prDensity: 'compact',
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

  setPrDensity: (prDensity) => {
    set({ prDensity });
    persistToTauriStore('ui-state.json', 'prDensity', prDensity).catch(() => {});
  },

  restorePersistedSection: () => {
    if (get()._hasUserNavigated) return;
    Promise.all([
      readFromTauriStore<ActiveSection>('ui-state.json', 'activeSection'),
      readFromTauriStore<PrGroupBy>('ui-state.json', 'prGroupBy'),
      readFromTauriStore<PrDensity>('ui-state.json', 'prDensity'),
    ])
      .then(([section, groupBy, density]) => {
        if (get()._hasUserNavigated) return;
        const preferences: Partial<UiState> = {};
        if (section && (section === 'prs' || section === 'focus' || section === 'workitems')) {
          preferences.activeSection = section;
        }
        if (groupBy && (groupBy === 'repo' || groupBy === 'author' || groupBy === 'status')) {
          preferences.prGroupBy = groupBy;
        }
        if (density && (density === 'normal' || density === 'compact')) {
          preferences.prDensity = density;
        }
        set(preferences);
      })
      .catch((err) => console.warn('Failed to restore persisted UI preferences:', err));
  },
}));
