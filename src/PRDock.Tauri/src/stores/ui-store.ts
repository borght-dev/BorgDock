import { create } from 'zustand';

export type ActiveSection = 'prs' | 'workitems';

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
}

export const useUiStore = create<UiState>()((set) => ({
  isSidebarVisible: true,
  isSettingsOpen: false,
  activeSection: 'prs',
  selectedPrNumber: null,
  expandedRepoGroups: new Set<string>(),
  expandedPrNumbers: new Set<number>(),
  isCommandPaletteOpen: false,
  isDragging: false,
  pendingWorkItemId: null,

  toggleSidebar: () => set((state) => ({ isSidebarVisible: !state.isSidebarVisible })),

  setSidebarVisible: (visible) => set({ isSidebarVisible: visible }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),

  setActiveSection: (section) => set({ activeSection: section }),

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
}));
