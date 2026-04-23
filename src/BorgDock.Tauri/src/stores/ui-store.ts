import { create } from 'zustand';
import type { WorktreeBranchMapping } from '@/hooks/useWorktreeMap';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

export type ActiveSection = 'prs' | 'focus' | 'workitems';

interface UiState {
  isSidebarVisible: boolean;
  isSettingsOpen: boolean;
  activeSection: ActiveSection;
  selectedPrNumber: number | null;
  expandedRepoGroups: Set<string>;
  expandedPrNumbers: Set<number>;
  isCommandPaletteOpen: boolean;
  isDragging: boolean;
  pendingWorkItemId: number | null;
  /** Maps branch name (lowercase) → worktree slot info */
  worktreeBranchMap: Map<string, WorktreeBranchMapping>;
  _hasUserNavigated: boolean;

  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveSection: (section: ActiveSection) => void;
  selectPr: (prNumber: number | null) => void;
  toggleRepoGroup: (repoKey: string) => void;
  collapseAllRepoGroups: () => void;
  togglePrExpanded: (prNumber: number) => void;
  collapseAllPrs: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setPendingWorkItemId: (id: number | null) => void;
  setWorktreeBranchMap: (map: Map<string, WorktreeBranchMapping>) => void;
  restorePersistedSection: () => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  isSidebarVisible: true,
  isSettingsOpen: false,
  activeSection: 'focus',
  selectedPrNumber: null,
  expandedRepoGroups: new Set<string>(),
  expandedPrNumbers: new Set<number>(),
  isCommandPaletteOpen: false,
  isDragging: false,
  pendingWorkItemId: null,
  worktreeBranchMap: new Map(),
  _hasUserNavigated: false,

  toggleSidebar: () => set((state) => ({ isSidebarVisible: !state.isSidebarVisible })),

  setSidebarVisible: (visible) => set({ isSidebarVisible: visible }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),

  setActiveSection: (section) => {
    set({ activeSection: section, _hasUserNavigated: true });
    persistToTauriStore('ui-state.json', 'activeSection', section).catch((err) =>
      console.warn('Failed to persist activeSection:', err),
    );
  },

  selectPr: (prNumber) => set({ selectedPrNumber: prNumber }),

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

  togglePrExpanded: (prNumber) =>
    set((state) => {
      const next = new Set(state.expandedPrNumbers);
      if (next.has(prNumber)) {
        next.delete(prNumber);
      } else {
        next.add(prNumber);
      }
      return { expandedPrNumbers: next };
    }),

  collapseAllPrs: () => set({ expandedPrNumbers: new Set() }),

  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),

  setDragging: (dragging) => set({ isDragging: dragging }),

  setPendingWorkItemId: (id) => set({ pendingWorkItemId: id }),

  setWorktreeBranchMap: (map) => set({ worktreeBranchMap: map }),

  restorePersistedSection: () => {
    if (get()._hasUserNavigated) return;
    readFromTauriStore<ActiveSection>('ui-state.json', 'activeSection')
      .then((section) => {
        if (get()._hasUserNavigated) return;
        if (section && (section === 'prs' || section === 'focus' || section === 'workitems')) {
          set({ activeSection: section });
        }
      })
      .catch((err) => console.warn('Failed to restore persisted section:', err));
  },
}));
