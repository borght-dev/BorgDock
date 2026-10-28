import { create } from 'zustand';
import type { PullRequest } from '@/types';

interface T3ThreadState {
  /** While set, the main window asks where a new T3 thread for this PR runs. */
  pendingPr: PullRequest | null;
  setPendingPr: (pr: PullRequest | null) => void;
}

export const useT3ThreadStore = create<T3ThreadState>()((set) => ({
  pendingPr: null,
  setPendingPr: (pendingPr) => set({ pendingPr }),
}));
