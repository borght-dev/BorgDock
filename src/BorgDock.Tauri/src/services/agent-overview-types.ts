export type SessionState = 'working' | 'tool' | 'awaiting' | 'finished' | 'idle' | 'ended';

export type TurnFileTool = 'edit' | 'write' | 'read';

export interface TurnFile {
  path: string;
  tool: TurnFileTool;
  timestampMs: number;
}

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
  /** Most recent assistant text from this session's .jsonl. Surfaced on
   *  Awaiting/Finished cards so the user can see the question they need to
   *  answer (the user's last reply is often a single letter and useless
   *  without context). */
  lastAssistantMsg: string | null;
  task: string | null;
  model: string | null;
  tokensUsed: number;
  tokensMax: number;
  lastApiStopReason: string | null;
  currentTurnFiles: TurnFile[];
  snoozedUntilMs: number | null;
  seenAtMs: number | null;
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
