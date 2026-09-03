import { create } from 'zustand';
import type { PullRequest } from '@/types';

interface T3ThreadState {
  /**
   * PR whose branch is not checked out anywhere yet. While set, the window
   * shows the worktree picker; once a worktree is ready the thread opens on it.
   */
  pendingCheckout: PullRequest | null;
  setPendingCheckout: (pr: PullRequest | null) => void;
}

export const useT3ThreadStore = create<T3ThreadState>()((set) => ({
  pendingCheckout: null,
  setPendingCheckout: (pendingCheckout) => set({ pendingCheckout }),
}));
