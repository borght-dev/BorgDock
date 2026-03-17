import { create } from 'zustand';

export type ActiveSection = 'prs' | 'workitems';

interface UiState {
  isSidebarVisible: boolean;
  isSettingsOpen: boolean;
  activeSection: ActiveSection;
  selectedPrNumber: number | null;
  expandedRepoGroups: Set<string>;

  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveSection: (section: ActiveSection) => void;
  selectPr: (prNumber: number | null) => void;
  toggleRepoGroup: (repoKey: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  isSidebarVisible: true,
  isSettingsOpen: false,
  activeSection: 'prs',
  selectedPrNumber: null,
  expandedRepoGroups: new Set<string>(),

  toggleSidebar: () =>
    set((state) => ({ isSidebarVisible: !state.isSidebarVisible })),

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
}));
