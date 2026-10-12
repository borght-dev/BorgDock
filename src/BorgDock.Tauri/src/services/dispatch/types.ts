/**
 * Dispatch — the model behind the Dispatch section: every Azure DevOps item
 * assigned to you, joined with its T3 threads and its pull request, sorted by
 * what it needs from you.
 */

/** Where an item sits, most urgent first. */
export type Bay = 'waiting' | 'drift' | 'working' | 'next' | 'idle' | 'paused' | 'handed';

export const BAYS: readonly Bay[] = [
  'waiting',
  'drift',
  'working',
  'next',
  'idle',
  'paused',
  'handed',
];

export const BAY_LABEL: Record<Bay, string> = {
  waiting: 'Waiting on you',
  drift: 'Out of sync',
  working: 'Agents working',
  next: 'Up next',
  idle: 'Not started',
  paused: 'Paused',
  handed: 'Handed off',
};

export type ThreadStatus =
  | 'question'
  | 'plan'
  | 'approval'
  | 'your-turn'
  | 'failed'
  | 'running'
  | 'settled';

/** Thread states in which the agent has stopped and waits for you. */
export const NEEDS_YOU: readonly ThreadStatus[] = [
  'question',
  'plan',
  'approval',
  'your-turn',
  'failed',
];

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  question: 'Agent asks',
  plan: 'Plan to review',
  approval: 'Needs approval',
  'your-turn': 'Your turn',
  failed: 'Agent failed',
  running: 'Running',
  settled: 'Settled',
};

export type PullRequestState = 'open' | 'merged' | 'closed' | 'unknown';

export type StateCategory = 'Proposed' | 'InProgress' | 'Resolved' | 'Completed' | 'Removed';

export interface WorkflowState {
  name: string;
  category: StateCategory;
}

export interface AgentQuestion {
  id: string;
  question: string;
  /** `value` is what T3 expects back; `label` is for display. */
  options: { label: string; value: string }[];
  /** Index of the option the agent recommends. */
  recommended: number | null;
  allowCustomAnswer: boolean;
  multiSelect: boolean;
}

/** A pull request as T3 knows it from a thread. */
export interface ThreadPullRequest {
  number: number;
  url: string;
  state: PullRequestState;
  title: string;
  headBranch: string | null;
  isDraft: boolean;
}

/** A T3 thread. Ids of threads and projects on a remote host carry the host id as a prefix. */
export interface AgentThread {
  id: string;
  hostId: string;
  hostLabel: string;
  /** False while the thread's host is offline: its last known state shows, its actions don't run. */
  available: boolean;
  projectId: string;
  /** Title of the T3 project the thread runs in. */
  slot: string;
  title: string;
  branch: string | null;
  createdAt: string;
  lastActivityAt: string;
  open: boolean;
  status: ThreadStatus;
  /** `plan` keeps the agent read-only until the thread is switched back to `default`. */
  interactionMode: string;
  model: string;
  modelInstance: string | null;
  effort: string | null;
  pullRequests: ThreadPullRequest[];
  firstUserMessage: string;
  /** Present while the agent waits for answers. */
  questionRequestId: string | null;
  questions: AgentQuestion[];
  lastAgentMessage: string | null;
}

/** A T3 project: a checkout an agent can run in. */
export interface AgentProject {
  id: string;
  hostId: string;
  hostLabel: string;
  available: boolean;
  title: string;
  workspaceRoot: string | null;
}

/** An Azure DevOps work item as the engine needs it. */
export interface DispatchItem {
  id: number;
  typeName: string;
  title: string;
  state: string;
  stateCategory: StateCategory;
  /** Workflow of the item's type, in process order. */
  states: WorkflowState[];
  /** Last segment of the iteration path, or "Backlog". */
  sprint: string;
  dueDate: string | null;
  priority: number | null;
  tags: string[];
  assignedTo: string | null;
  assignedToMe: boolean;
  url: string;
  /** Numbers of the GitHub pull requests linked on the item. */
  linkedPullRequests: number[];
  changedAt: string;
}

export interface CheckSummary {
  passed: number;
  failed: number;
  pending: number;
  total: number;
}

/** A pull request BorgDock polls from GitHub, reduced to what the engine reads. */
export interface KnownPullRequest {
  number: number;
  url: string;
  state: PullRequestState;
  title: string;
  isDraft: boolean;
  branch: string | null;
  /** Work item ids named in its title, body, branch or labels. */
  workItemIds: number[];
  checks: CheckSummary | null;
}

/** The pull request that says something about an item's state. */
export interface UnitPullRequest {
  number: number;
  url: string;
  state: PullRequestState;
  title: string;
  isDraft: boolean;
  branch: string | null;
  /** Live checks, when BorgDock polls this pull request from GitHub. */
  checks: CheckSummary | null;
}

export interface Suggestion {
  /** Stable while the evidence is unchanged, so a hidden suggestion stays hidden. */
  id: string;
  /** State to move the item to, or null when there is nothing to move, only something to look at. */
  to: string | null;
  reason: string;
}

export interface ItemOverview {
  item: DispatchItem;
  bay: Bay;
  waitingFor: string | null;
  suggestion: Suggestion | null;
  pullRequest: UnitPullRequest | null;
  /** Newest first. The first one is the item's current thread. */
  threads: AgentThread[];
  queued: boolean;
}

export type SlotState = 'free' | 'mine' | 'busy';

/** A T3 project seen as a place to start an agent. */
export interface Slot {
  id: string;
  hostId: string;
  hostLabel: string;
  available: boolean;
  name: string;
  workspaceRoot: string | null;
  /** free: no open thread. mine: an open thread on one of my items. busy: an open thread on anything else. */
  state: SlotState;
  itemId: number | null;
  running: boolean;
  needsYou: boolean;
}

export interface UnlinkedThread extends AgentThread {
  guessItemId: number | null;
}

export interface Overview {
  generatedAt: string;
  items: ItemOverview[];
  unlinkedThreads: UnlinkedThread[];
  slots: Slot[];
}
