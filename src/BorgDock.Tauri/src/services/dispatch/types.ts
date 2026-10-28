/**
 * Dispatch — the model behind the Dispatch section: every Azure DevOps item
 * assigned to you, joined with its T3 threads and its pull request, sorted by
 * what it needs from you.
 */

import type { T3Repository, T3Run } from '@/services/t3/api';

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
  handed: 'In review or QA',
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
  /**
   * Where the thread works, as rows name it: its branch when T3 made a
   * worktree for it, else its project's title.
   */
  place: string;
  title: string;
  branch: string | null;
  /** The worktree the thread works in; absent when it works in its project's own checkout. */
  worktreePath?: string | null;
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
  conversationReferences?: { explicitIds: number[]; mentionedIds: number[] };
  /**
   * The thread this subagent works for (scoped id). A subagent is never open on
   * its own: the items it names belong to its root thread.
   */
  subagentOf?: string | null;
  updatedAt?: string;
  /** Present while the agent waits for answers. */
  questionRequestId: string | null;
  questions: AgentQuestion[];
  lastAgentMessage: string | null;
  /** The latest run as the shell reported it; the activity journal compares it. */
  run?: T3Run;
}

/** A T3 project: a checkout an agent can run in. */
export interface AgentProject {
  id: string;
  hostId: string;
  hostLabel: string;
  available: boolean;
  title: string;
  workspaceRoot: string | null;
  /** The git repository the project checks out; absent outside one. */
  repository?: T3Repository | null;
}

/** The newest block of an item's Developer Notes. */
export interface ItemNote {
  text: string;
  /** The date the block names (`YYYY-MM-DD`), when it names one. */
  date: string | null;
}

/** The newest comment in an item's discussion, as plain text. */
export interface ItemComment {
  /** ADO's comment id. */
  id?: number;
  /** Who wrote it: `Vera · plan` for a comment Vera signed, else the account that posted it. */
  author: string;
  at: string;
  text: string;
  /** Posted from my account and not signed by an agent. */
  byMe: boolean;
}

/**
 * A GitHub pull request linked on a work item. ADO names the repository by its
 * own id for it, not by owner and name.
 */
export interface LinkedPullRequest {
  repositoryId: string;
  number: number;
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
  /** The whole iteration path, e.g. `Shop\Release 5\Sprint 12`. */
  iterationPath: string;
  notes: ItemNote | null;
  lastComment: ItemComment | null;
  dueDate: string | null;
  priority: number | null;
  tags: string[];
  assignedTo: string | null;
  assignedToMe: boolean;
  url: string;
  /** The GitHub pull requests linked on the item. */
  linkedPullRequests: LinkedPullRequest[];
  /** The item's parent (a PBI for a task, an epic for a PBI). */
  parentId: number | null;
  /** The item's children, as ADO's hierarchy links name them. */
  childIds?: number[];
  changedAt: string;
  /** `System.Rev`: moves with every change, the activity journal keys state changes by it. */
  rev?: number;
  /** Who made the latest change (`System.ChangedBy`), as a display name. */
  changedBy?: string | null;
  /** The latest change was mine: the activity journal leaves it out. */
  changedByMe?: boolean;
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
  approved: boolean;
  mergedAt: string | null;
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
  /** Known only for pull requests BorgDock polls. */
  approved: boolean;
  mergedAt: string | null;
  /**
   * Linked to several of my items without naming this one, like the plan of an
   * epic: it says nothing about this item's own state.
   */
  shared: boolean;
}

/** How much a verdict asks of you: `bad` now, `warn` a look, `ok` a move, `run` and `mute` nothing. */
export type Tone = 'bad' | 'warn' | 'ok' | 'run' | 'mute';

export interface Verdict {
  label: string;
  tone: Tone;
}

/** One fact behind a verdict, drawn as a chip. */
export interface Evidence {
  label: string;
  tone: Tone | null;
}

/** What was said last about an item, wherever it was said. */
export interface LatestMessage {
  source: 'comment' | 'notes' | 'agent';
  author: string;
  /** ISO time, or a `YYYY-MM-DD` date for notes. */
  at: string | null;
  text: string;
}

/** The state an item's evidence says it belongs in, when that is not the state ADO has. */
export interface Suggestion {
  /** Stable while the evidence is unchanged, so a hidden suggestion stays hidden. */
  id: string;
  to: string;
  reason: string;
}

export interface ItemOverview {
  item: DispatchItem;
  bay: Bay;
  waitingFor: string | null;
  suggestion: Suggestion | null;
  pullRequest: UnitPullRequest | null;
  /** Every pull request of the item, open first. */
  pullRequests: UnitPullRequest[];
  /** Newest first. The first one is the item's current thread. */
  threads: AgentThread[];
  queued: boolean;
  verdict: Verdict;
  evidence: Evidence[];
  latest: LatestMessage | null;
}

export interface UnlinkedThread extends AgentThread {
  guessItemId: number | null;
}

export interface Overview {
  generatedAt: string;
  items: ItemOverview[];
  /**
   * Items Dispatch doesn't list but a workstream links: done ones, epics,
   * items of others. Built the same way, never shown in Dispatch.
   */
  context?: ItemOverview[];
  /**
   * A Dispatch item's pull requests when the context items count too: a
   * plan PR linked on one Dispatch item and on context items is shared.
   * Only for items where that differs; Dispatch itself shows `pullRequests`.
   */
  combinedPullRequests?: Record<number, UnitPullRequest[]>;
  unlinkedThreads: UnlinkedThread[];
}

/**
 * What a sync covers: the items in one state, every item, the items out of
 * sync, or one item, moved to `to` when that is given.
 */
export type SyncScope =
  | { kind: 'state'; state: string }
  | { kind: 'all' }
  | { kind: 'drift' }
  | { kind: 'item'; itemId: number; to: string | null };
