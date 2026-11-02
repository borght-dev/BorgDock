import { create } from 'zustand';
import type { PrThreadStart } from '@/services/t3-thread';
import type { PullRequest } from '@/types';

interface T3ThreadState {
  /** While set, the main window asks where a new T3 thread for this PR runs. */
  pendingPr: PullRequest | null;
  /** What that thread starts on; null opens it empty. */
  pendingStart: PrThreadStart | null;
  setPendingPr: (pr: PullRequest | null, start?: PrThreadStart) => void;
}

export const useT3ThreadStore = create<T3ThreadState>()((set) => ({
  pendingPr: null,
  pendingStart: null,
  setPendingPr: (pendingPr, start) => set({ pendingPr, pendingStart: start ?? null }),
}));
