import { create } from 'zustand';
import type {
  GuardDecision,
  LaunchConflict,
  LaunchTarget,
} from '@/services/ci-failures/launch-guard';

export interface GuardQuestion {
  conflict: LaunchConflict;
  target: LaunchTarget;
  /** What the launch was going to do: "Fix with Claude", "Open in T3". */
  action: string;
}

interface CiGuardState {
  question: GuardQuestion | null;
  /** How many launch guard dialogs this window has mounted. */
  dialogs: number;
  /** Shows the launch guard dialog and resolves with what was picked. A new question cancels the old one. */
  ask: (question: GuardQuestion) => Promise<GuardDecision>;
  answer: (decision: GuardDecision) => void;
  /** Registers a mounted dialog; returns its unregister. */
  attachDialog: () => () => void;
}

let pending: ((decision: GuardDecision) => void) | null = null;

/** The one open launch guard question of this window. */
export const useCiGuardStore = create<CiGuardState>()((set, get) => ({
  question: null,
  dialogs: 0,
  ask: (question) => {
    // A window without the dialog (the worktree palette) can't ask; never block its launch.
    if (get().dialogs === 0) return Promise.resolve('proceed');
    return new Promise<GuardDecision>((resolve) => {
      pending?.('cancel');
      pending = resolve;
      set({ question });
    });
  },
  answer: (decision) => {
    const resolve = pending;
    pending = null;
    set({ question: null });
    resolve?.(decision);
  },
  attachDialog: () => {
    set((state) => ({ dialogs: state.dialogs + 1 }));
    return () => set((state) => ({ dialogs: state.dialogs - 1 }));
  },
}));
