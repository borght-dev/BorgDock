import { create } from 'zustand';

export interface T3Session {
  threadId: string;
  title: string;
  branch?: string;
  worktreePath?: string;
  workspaceRoot: string;
  status: string;
  updatedAt: string;
  linkedPullRequestJson?: string;
}

interface T3SessionState {
  sessions: T3Session[];
  setSessions: (sessions: T3Session[]) => void;
}

export const useT3SessionStore = create<T3SessionState>()((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
}));
