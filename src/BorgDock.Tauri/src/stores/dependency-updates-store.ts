import { create } from 'zustand';

interface DependencyUpdatesState {
  /** The Approve dependency updates sheet is open (main window). */
  sheetOpen: boolean;
  /** `prRowKey`s of approvals waiting for Undo or being sent: their rows offer no Approve. */
  pending: ReadonlySet<string>;
  openSheet: () => void;
  closeSheet: () => void;
  setPending: (keys: readonly string[], pending: boolean) => void;
}

export const useDependencyUpdatesStore = create<DependencyUpdatesState>((set) => ({
  sheetOpen: false,
  pending: new Set(),
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  setPending: (keys, pending) =>
    set((state) => {
      const next = new Set(state.pending);
      for (const key of keys) {
        if (pending) next.add(key);
        else next.delete(key);
      }
      return { pending: next };
    }),
}));
