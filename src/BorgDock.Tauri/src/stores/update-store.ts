import { create } from 'zustand';
import type { UpdatePhase, UpdateStatus_Serialize } from '@/generated/commands';

/** The status as Rust sends it. */
export type UpdateStatus = UpdateStatus_Serialize;
export type { UpdatePhase };

/**
 * The update status as Rust keeps it (`updater/`), the same in every window:
 * `runtime/update-status.ts` fills it. Nothing here schedules a check.
 */
interface UpdateState extends UpdateStatus {
  /** This window asked for the restart and the installer is starting. */
  restarting: boolean;
}

interface UpdateActions {
  setStatus: (status: UpdateStatus) => void;
  setRestarting: (restarting: boolean) => void;
  reset: () => void;
}

const initialState: UpdateState = {
  phase: 'idle',
  currentVersion: '',
  version: null,
  progress: 0,
  lastCheckedAt: null,
  lastError: null,
  restarting: false,
};

export const useUpdateStore = create<UpdateState & UpdateActions>((set) => ({
  ...initialState,
  setStatus: (status) => set(status),
  setRestarting: (restarting) => set({ restarting }),
  reset: () => set(initialState),
}));
