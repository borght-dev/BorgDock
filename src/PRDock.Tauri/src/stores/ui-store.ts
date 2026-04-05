import { create } from 'zustand';
import type { WorktreeBranchMapping } from '@/hooks/useWorktreeMap';

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

export const useUiStore = create<UiState>()((set) => ({
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

  toggleSidebar: () => set((state) => ({ isSidebarVisible: !state.isSidebarVisible })),

  setSidebarVisible: (visible) => set({ isSidebarVisible: visible }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),

  setActiveSection: (section) => {
    set({ activeSection: section });
    // Persist last active section
    import('@tauri-apps/plugin-store').then(({ load }) => {
      load('ui-state.json').then((store) => {
        store.set('activeSection', section);
        store.save();
      });
    }).catch(() => {});
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
    import('@tauri-apps/plugin-store').then(({ load }) => {
      load('ui-state.json').then(async (store) => {
        const section = await store.get<ActiveSection>('activeSection');
        if (section && (section === 'prs' || section === 'focus' || section === 'workitems')) {
          set({ activeSection: section });
        }
      });
    }).catch(() => {});
  },
}));
