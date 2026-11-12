// The Dispatch HTTP API contract. The server and the web app import these types; the iOS app mirrors
// them in Swift (src/BorgDock.iOS/BorgDock/Model/API.swift). Bump API_VERSION when a change breaks existing clients.
export const API_VERSION = 2;

export * from './borgdock.ts';
import type { ItemWalk, Walk } from './borgdock.ts';

/* ---------- overview ---------- */

export type Bay = 'waiting' | 'drift' | 'working' | 'next' | 'idle' | 'paused' | 'handed';

export type ThreadStatus = 'question' | 'plan' | 'approval' | 'your-turn' | 'failed' | 'running' | 'settled';

export type PullRequestState = 'open' | 'merged' | 'closed' | 'unknown';

export type AgentQuestion = {
  id: string;
  question: string;
  /** `value` is what T3 expects back; `label` is for display; `description` is the agent's reason, when it gave one. */
  options: { label: string; value: string; description?: string }[];
  recommended: number | null;
  allowCustomAnswer: boolean;
  multiSelect: boolean;
};

export type ThreadSummary = {
  id: string;
  environmentId?: string;
  environmentLabel?: string;
  available?: boolean;
  title: string;
  worktree: string;
  branch: string | null;
  status: ThreadStatus;
  createdAt: string;
  lastActivityAt: string;
  model: string;
  /** Present while the agent waits for answers. */
  questionRequestId: string | null;
  questions: AgentQuestion[];
  /** Latest agent message, only for open threads. */
  lastAgentMessage: string | null;
  /** T3's web UI; works on the tailnet once that browser is paired with T3. */
  link: string;
  /** Opens the thread in the T3 Code iOS app: t3code://threads/<environmentId>/<threadId>. */
  appLink: string;
};

export type PullRequest = {
  number: number;
  url: string;
  /** The PR's head branch, when T3 knows it. */
  branch: string | null;
  state: PullRequestState;
  title: string;
  isDraft: boolean;
  checks: string | null;
};

export type Suggestion = {
  /** Stable while the evidence is unchanged; used to dismiss and to avoid repeat notifications. */
  id: string;
  /** Target ADO state, or null when the suggestion is "look at this" without a state move. */
  to: string | null;
  reason: string;
};

export type ItemType = 'Bug' | 'PBI' | 'QI' | 'Task' | 'Other';

export type WorkItemSummary = {
  id: number;
  type: ItemType;
  typeName: string;
  title: string;
  state: string;
  stateCategory: 'Proposed' | 'InProgress' | 'Resolved' | 'Completed' | 'Removed';
  /** Workflow states in process order. */
  workflow: string[];
  sprint: string;
  dueDate: string | null;
  priority: number | null;
  tags: string[];
  assignedTo: string | null;
  /** Compared on the account, not the display name (ADO shows names differently in different places). */
  assignedToMe: boolean;
  url: string;
};

export type ItemOverview = {
  item: WorkItemSummary;
  bay: Bay;
  waitingFor: string | null;
  suggestion: Suggestion | null;
  pullRequest: PullRequest | null;
  /** Newest first. The first one is the thread Dispatch considers current. */
  threads: ThreadSummary[];
  queuedAt: string | null;
  /** BorgDock's states walk: the verdict, its evidence and the latest message. */
  walk?: ItemWalk;
};

export type Worktree = {
  id?: string;
  environmentId?: string;
  environmentLabel?: string;
  available?: boolean;
  models?: ModelOption[];
  defaultModel?: string | null;
  name: string;
  /** free: no open thread. mine: an open thread on one of my items. busy: an open thread on anything else. */
  state: 'free' | 'mine' | 'busy';
  itemId: number | null;
  running: boolean;
  needsYou: boolean;
};

export type SourceStatus = { ok: boolean; at: string | null; error: string | null };

export type Overview = {
  generatedAt: string;
  items: ItemOverview[];
  unlinkedThreads: (ThreadSummary & { guessItemId: number | null })[];
  worktrees: Worktree[];
  sources: { ado: SourceStatus; t3: SourceStatus; environments?: EnvironmentStatus[] };
  /** BorgDock's lanes in walk order and the briefing line. */
  walk?: Walk;
};

export type EnvironmentStatus = SourceStatus & { environmentId: string; label: string };

/* ---------- item detail and browse ---------- */

export type ItemDetail = {
  item: WorkItemSummary;
  description: string;
  acceptanceCriteria: string;
  reproSteps: string;
  /** The team's custom "QA Notes" field (Custom.QANotes), as plain text. */
  qaNotes: string;
  comments: ItemComment[];
  /** The rich-text fields as GitHub-flavoured markdown. Images point at signed /api/items/:id/attachments/… URLs. */
  markdown?: ItemMarkdown;
  /** Newest first, from the item's revisions. */
  history?: ItemHistoryEvent[];
  /** Every pull request linked to the item (ADO links and AB# mentions), its own first. */
  pullRequests?: ItemPullRequest[];
  parent?: { id: number; title: string; typeName: string } | null;
  effort?: number | null;
  areaPath?: string | null;
  attachments?: ItemAttachment[];
};

export type ItemComment = {
  id?: number;
  by: string;
  at: string;
  /** Plain text, for older apps. */
  text: string;
  /** The comment as markdown. */
  markdown?: string;
};

export type ItemMarkdown = { description: string; acceptanceCriteria: string; reproSteps: string; qaNotes: string; developerNotes: string };

export type ItemHistoryEvent = {
  at: string;
  by: string;
  kind: 'created' | 'state' | 'assigned' | 'pullRequest';
  from: string | null;
  to: string | null;
  /** For kind 'pullRequest': the PR number linked. */
  pullRequest?: number | null;
};

export type ItemPullRequest = PullRequest & {
  /** owner/repo when known. */
  repository: string | null;
  /** Its title or branch names the item: the item's own pull request. */
  own: boolean;
  /** Linked on several of my items without naming any of them (an epic's plan PR). */
  shared: boolean;
  author: string | null;
  updatedAt: string | null;
};

/** `url` is a signed server path (/api/items/:id/attachments/:guid?…) that loads without an Authorization header. */
export type ItemAttachment = { name: string; url: string; size: number | null };

/** POST /api/items/:id/comments */
export type PostItemCommentRequest = { text: string };
export type PostItemCommentResponse = { comment: ItemComment };

export type BrowseQuery = { id: string; name: string; group: string };

export type BrowseResult = { items: WorkItemSummary[]; truncated: boolean };

/* ---------- sprint ---------- */

/** A backlog item in the current sprint. Finished items stay in, so the iPhone's Sprint tab can count progress. */
export type SprintItem = WorkItemSummary & {
  /** When the item last changed state (Microsoft.VSTS.Common.StateChangeDate). */
  stateChangedAt: string | null;
  /** When it reached a Completed state; null while it is open. */
  finishedAt: string | null;
};

/** GET /api/sprint: the team's current sprint and every backlog item in it, whoever has it. */
export type Sprint = {
  /** As work items show it: "5.2.8". */
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  items: SprintItem[];
  generatedAt: string;
};

/* ---------- actions ---------- */

/** @deprecated Use ModelOption ids. Kept so older app builds can still start threads. */
export type AgentId = 'codex' | 'claude';

export type ModelOption = {
  /** `<instance>/<model>`, e.g. `codex/gpt-6.1-sol`; what StartThreadRequest.model takes. */
  id: string;
  label: string;
  provider: 'Codex' | 'Claude' | 'Other';
  /** Used in T3 in the last three weeks; these come first. */
  recent: boolean;
  /** Reasoning levels this model supports, lowest first. Empty when it has none. */
  efforts: { id: string; label: string }[];
  /** What the start sheet preselects: your last pick for this model, else what you last used in T3, else the model's default. */
  defaultEffort: string | null;
};

export type StartThreadRequest = {
  itemId: number;
  worktree: string;
  /** A ModelOption id. */
  model?: string;
  /** A ModelOption effort id; null or missing uses the model's default. */
  effort?: string | null;
  /** @deprecated Older app builds send this instead of model. */
  agent?: AgentId;
  /**
   * plan: propose a plan first. default: straight to work. qa: hand the item to QA (the repository's ado-update-for-qa skill).
   * done: close it as Done without QA, with the reason in the item's notes.
   */
  mode: 'plan' | 'default' | 'qa' | 'done';
  prompt: string;
  /** Move ADO to this state as part of starting. Null leaves ADO alone. */
  moveAdoTo: string | null;
  assignToMe: boolean;
};

/** `warning` is set when the thread started but an ADO step (assign, state move) failed. */
/** GET /api/items/:id/start: what the start sheet prefills. Both prompts can be edited before starting. */
export type StartOptions = {
  prompts: { pickup: string; qa: string; done: string };
  /** Branch the item's work lives on, if known (used by the QA prompt). */
  branch: string | null;
  /** The free worktree the item last ran in, best for QA and Done handoffs; null if none is free. */
  qaWorktree: string | null;
  qaWorkspaceId?: string | null;
};

export type StartThreadResponse = { threadId: string; link: string; appLink: string; adoState: string | null; warning: string | null };

export type AnswerRequest = { requestId: string; answers: Record<string, string | string[]> };

export type MoveStateRequest = { to: string };

export type MoveStateResponse = { state: string };

export type LinkThreadRequest = { itemId: number | null };

/* ---------- config ---------- */

export type AppConfig = {
  apiVersion: number;
  user: { name: string; email: string };
  models: ModelOption[];
  /** Your last pick, else Codex's newest model. */
  defaultModel: string | null;
  /** @deprecated Older app builds read these two; prefer models and defaultModel. */
  agents: { id: AgentId; label: string }[];
  defaultAgent: AgentId;
  worktrees: string[];
  /** Placeholders: {id} {title} {branch}. */
  promptTemplate: string;
  vapidPublicKey: string | null;
};

/* ---------- auth ---------- */

export type SessionInfo = {
  id: string;
  kind: 'browser' | 'app';
  name: string;
  createdAt: string;
  lastSeenAt: string;
  lastSeenVia: 'internet' | 'tailnet' | 'local';
  current: boolean;
};

export type PasskeyInfo = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export type AuthStatus = { setupRequired: boolean; authenticated: boolean; session: SessionInfo | null };

/** Native app sign-in: open /auth/app?state&code_challenge in ASWebAuthenticationSession, receive dispatch://auth?code&state, then exchange. */
/** `devicePublicKey` (BorgDock): the device's signing key, bound to the new session like the Clerk exchange does. */
export type AppTokenRequest = { code: string; codeVerifier: string; deviceName: string; devicePublicKey?: string };
export type AppTokenResponse = { token: string; sessionId: string };

/* ---------- push ---------- */

export type NotificationPreferences = { waiting: boolean; drift: boolean; finished: boolean };

export type WebPushRegistration = { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } };

export type ApnsRegistration = { deviceToken: string; environment: 'sandbox' | 'production' };

/**
 * Push payload extras (APNs `userInfo` / web push `data`):
 * kind 'question'   → itemId, threadId, requestId, questionId, options[{label,value}], recommended (category DISPATCH_QUESTION: actions answer.recommended, answer.text)
 * kind 'suggestion' → itemId, to                                                  (category DISPATCH_SUGGESTION: action move)
 * kind 'finished'   → itemId, threadId                                            (category DISPATCH_DEFAULT)
 */
export type PushData =
  | { kind: 'question'; itemId: number; threadId: string; requestId: string; questionId: string; options: { label: string; value: string; description?: string }[]; recommended: number | null; allowCustomAnswer: boolean; question?: string; context?: string }
  | { kind: 'suggestion'; itemId: number; to: string }
  | { kind: 'finished'; itemId: number; threadId: string }
  | { kind: 'waiting'; itemId: number };

/* ---------- live updates ---------- */

/** Server-sent events on GET /api/events: `event: overview` with `data: {"generatedAt": "..."}` whenever the overview changes. */
export type OverviewChanged = { generatedAt: string };
