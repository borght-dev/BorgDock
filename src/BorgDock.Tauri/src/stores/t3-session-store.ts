import { create } from 'zustand';

/** A T3 thread on this machine, as the pull request strip shows it. */
export interface T3Session {
  threadId: string;
  title: string;
  branch?: string;
  /** `waitingApproval`, `waitingInput`, `settled`, `running` or `active`. */
  status: string;
  updatedAt: string;
  /** URLs of the pull requests the thread is linked to. */
  pullRequestUrls: string[];
}

interface T3SessionState {
  sessions: T3Session[];
  setSessions: (sessions: T3Session[]) => void;
}

export const useT3SessionStore = create<T3SessionState>()((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
}));
