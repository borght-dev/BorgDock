export type SessionState = 'working' | 'tool' | 'awaiting' | 'finished' | 'idle' | 'ended';

export interface SessionRecord {
  sessionId: string;
  cwd: string;
  repo: string;
  worktree: string;
  branch: string;
  label: string;
  state: SessionState;
  stateSinceMs: number;
  lastEventMs: number;
  lastUserMsg: string | null;
  task: string | null;
  model: string | null;
  tokensUsed: number;
  tokensMax: number;
  lastApiStopReason: string | null;
}

export type SessionDelta =
  | { kind: 'upsert'; session: SessionRecord }
  | { kind: 'remove'; sessionId: string };

export interface StateDef {
  label: string;
  short: string;
  tone: 'warning' | 'success' | 'neutral' | 'draft';
  dotTone: 'yellow' | 'green' | 'violet' | 'gray';
  pulse: boolean;
  priority: number;
  description: string;
}
