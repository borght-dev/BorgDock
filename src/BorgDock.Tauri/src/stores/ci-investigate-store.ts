import { create } from 'zustand';

/** Which sheet a group action opened in the main window. */
export type CiSheet =
  | { kind: 'investigate'; groupId: string }
  | { kind: 'rerun'; groupId: string }
  | { kind: 'track'; groupId: string };

interface CiSheetState {
  sheet: CiSheet | null;
  open: (sheet: CiSheet) => void;
  close: () => void;
}

/** The related-failure sheet open in this window, if any. */
export const useCiSheetStore = create<CiSheetState>()((set) => ({
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
}));
