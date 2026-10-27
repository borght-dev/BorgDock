/**
 * Workstreams — a goal you curate by hand, with the ADO items, T3 threads and
 * pull requests that serve it, the decisions between alternative approaches,
 * the outcomes the goal needs and the evidence behind each.
 *
 * Only intentions and references are stored. What a source says now (title,
 * state, checks) is resolved from the snapshots BorgDock already holds.
 */

/** A GitHub pull request. Numbers collide across repositories, so the repository is part of it. */
export interface GitHubPrRef {
  kind: 'github-pr';
  owner: string;
  repo: string;
  number: number;
  /** GitHub's node id of the repository, once read: survives a rename or a transfer. */
  repositoryId?: string | null;
  /** The `gh` login to read it with, when no configured repository decides that. */
  account?: string | null;
}

/** An Azure DevOps work item. Ids are unique per organization. */
export interface AdoItemRef {
  kind: 'ado-item';
  organization: string;
  project: string;
  id: number;
}

/**
 * A T3 thread. The environment id names the T3 install, so a host that is
 * added again under another id still finds its threads; `hostId` is the host
 * it was linked from.
 */
export interface T3ThreadRef {
  kind: 't3-thread';
  environmentId: string;
  /** The id T3 itself knows the thread by, never the host-scoped one. */
  threadId: string;
  hostId: string;
}

/** Any other page: a spec, a design, a dashboard. Evidence only. */
export interface LinkRef {
  kind: 'link';
  url: string;
  title: string;
}

export type SourceRef = GitHubPrRef | AdoItemRef | T3ThreadRef | LinkRef;

export type RefKind = SourceRef['kind'];

/** The identity of a reference: `gh:github.com/owner/repo#12`, `ado:org#123`, `t3:env/thread`, `url:…`. */
export type RefKey = string;

/** A member, an outcome or a decision: what a relation can point at. */
export type NodeKey = RefKey;

export const OUTCOME_PREFIX = 'outcome:';
export const DECISION_PREFIX = 'decision:';

export type MemberRole = 'primary' | 'supporting' | 'context' | 'superseded';

export const MEMBER_ROLES: readonly MemberRole[] = [
  'primary',
  'supporting',
  'context',
  'superseded',
];

export const ROLE_LABEL: Record<MemberRole, string> = {
  primary: 'Primary',
  supporting: 'Supporting',
  context: 'Context',
  superseded: 'Superseded',
};

export type AddedBy = 'you' | 'suggestion' | 'agent' | 'run';

export interface Member {
  key: RefKey;
  ref: SourceRef;
  role: MemberRole;
  /** The title when it was linked; shown when the source can't be read. */
  label: string;
  note: string;
  addedAt: string;
  addedBy: AddedBy;
}

export type RelationKind = 'blocks' | 'supersedes';

export interface Relation {
  id: string;
  kind: RelationKind;
  from: NodeKey;
  to: NodeKey;
  note: string;
  /** Added by deciding this decision; reopening it takes the relation away again. */
  decisionId?: string | null;
}

export interface Decision {
  id: string;
  question: string;
  /** The members that are alternatives to each other. */
  options: RefKey[];
  status: 'open' | 'decided';
  chosen: RefKey | null;
  rationale: string;
  decidedAt: string | null;
  /** The options' roles before the decision, so reopening it restores them. */
  rolesBefore: Record<RefKey, MemberRole>;
}

export type RuleResult = 'met' | 'unmet' | 'unknown';

/**
 * A fact an outcome needs. `kind` names a rule in the registry (`rules.ts`);
 * one this version does not know keeps its data and evaluates to unknown.
 */
export interface EvidenceRule {
  id: string;
  kind: string;
  /** The member the rule reads. */
  target: RefKey;
  /** A branch for `pr-merged`, a state for `item-state`, a category for `item-category`. */
  value?: string | null;
}

export type VerificationState = 'unverified' | 'verified' | 'confirmed' | 'invalidated';

export interface VerificationFact {
  ruleId: string;
  result: RuleResult;
  observedAt: string;
  sourceKey: RefKey;
  summary: string;
}

export interface Verification {
  state: VerificationState;
  at: string | null;
  /** The device that verified, confirmed or invalidated it. */
  device: string | null;
  /** What the rules saw, for `verified` and `invalidated`. */
  facts: VerificationFact[];
  /** What you pointed at, for `confirmed`. */
  evidence: RefKey[];
  note: string;
  /** Accepted from an agent's proposal: the run thread that proposed it. */
  proposedBy?: RefKey | null;
}

export interface Outcome {
  id: string;
  title: string;
  required: boolean;
  rules: EvidenceRule[];
  verification: Verification;
}

export interface NextAction {
  text: string;
  /** The member or outcome it is about. */
  target: NodeKey | null;
  setAt: string;
  setBy: 'you' | 'agent' | 'suggestion';
}

export type ProposalKind =
  | 'next-action'
  | 'decision'
  | 'outcome-evidence'
  | 'add-member'
  | 'set-role'
  | 'new-outcome'
  | 'risk';

export interface ProposalItem {
  id: string;
  kind: ProposalKind;
  status: 'open' | 'accepted' | 'dismissed';
  /** Why the agent proposes it, in its words. */
  why: string;
  text?: string;
  target?: NodeKey | null;
  decisionId?: string;
  choose?: RefKey;
  outcomeId?: string;
  evidence?: RefKey[];
  url?: string;
  key?: RefKey;
  role?: MemberRole;
  title?: string;
  rules?: Omit<EvidenceRule, 'id'>[];
}

export interface Proposal {
  id: string;
  /** The review thread that wrote it. */
  runKey: RefKey;
  at: string;
  items: ProposalItem[];
  /** References the agent named that the workstream does not hold. */
  dropped: string[];
  /** The agent's reply, when it held no proposal block. */
  message?: string;
}

export type RunKind = 'review' | 'work';

/** A thread started from the workstream. */
export interface WorkstreamRun {
  key: RefKey;
  kind: RunKind;
  startedAt: string;
  device: string;
  /** For a review: its proposal has been read. */
  read?: boolean;
}

export type LogKind =
  | 'created'
  | 'edited'
  | 'status'
  | 'member-added'
  | 'member-removed'
  | 'member-role'
  | 'relation-added'
  | 'relation-removed'
  | 'decision-opened'
  | 'decision-decided'
  | 'decision-reopened'
  | 'decision-removed'
  | 'outcome-added'
  | 'outcome-removed'
  | 'outcome-verified'
  | 'outcome-confirmed'
  | 'outcome-invalidated'
  | 'outcome-unconfirmed'
  | 'next-action'
  | 'proposal-accepted'
  | 'run-started'
  | 'conflict-resolved'
  | 'relinked';

export interface LogEntry {
  id: string;
  at: string;
  device: string;
  kind: LogKind;
  summary: string;
  refs: NodeKey[];
}

export type WorkstreamStatus = 'active' | 'paused' | 'done' | 'archived';

export const WORKSTREAM_STATUSES: readonly WorkstreamStatus[] = [
  'active',
  'paused',
  'done',
  'archived',
];

export interface Workstream {
  id: string;
  title: string;
  goal: string;
  status: WorkstreamStatus;
  pinned: boolean;
  members: Member[];
  outcomes: Outcome[];
  relations: Relation[];
  decisions: Decision[];
  nextAction: NextAction | null;
  proposals: Proposal[];
  runs: WorkstreamRun[];
  dismissedSuggestions: string[];
  log: LogEntry[];
  createdAt: string;
  completedAt: string | null;
}

export const SCHEMA_VERSION = 1;

/** A workstream as one file holds it. */
export interface WorkstreamDocument extends Workstream {
  schema: number;
  revision: number;
  updatedAt: string;
  writtenBy: { deviceId: string; deviceLabel: string };
}

export const LIMITS = {
  title: 200,
  goal: 10_000,
  note: 500,
  nextAction: 500,
  members: 200,
  outcomes: 50,
  relations: 300,
  decisions: 50,
  proposals: 20,
  log: 500,
  rules: 10,
} as const;
