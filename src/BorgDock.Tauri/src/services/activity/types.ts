/**
 * The activity journal: what changed since I last checked, kept until I
 * read or dismiss it. Rust (`src-tauri/src/activity/`) stores entries,
 * baselines and the outbox; TypeScript derives entries from observations
 * the app already accepts. Spec: docs/superpowers/plans/2026-10-26-activity-digest-plan.md.
 */

export const ACTIVITY_CATEGORIES = [
  'agent.question',
  'agent.plan',
  'agent.approval',
  'agent.turn',
  'agent.turns-missed',
  'agent.failed',
  'agent.interrupted',
  'agent.limited',
  'agent.report',
  'pr.review',
  'pr.findings',
  'pr.review-request',
  'pr.checks-failed',
  'pr.checks-passed',
  'pr.ready',
  'pr.conflict',
  'pr.merged',
  'pr.closed',
  'ci.group-grew',
  'ci.owner-stale',
  'ci.fix-merged',
  'ci.seen-after-fix',
  'ci.resolved',
  'workstream.unblocked',
  'workstream.invalidated',
  'workstream.reopened',
  'workstream.conflict',
  'workstream.proposal',
  'workstream.ready',
  'deploy.pr',
  'deploy.reached',
  'deploy.failed',
  'ado.assigned',
  'ado.state',
  'ado.comment',
  'activity.rollup',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** The chips in the Activity header; `agent.report` sits under Agents. */
export type ActivityCategoryGroup =
  | 'agents'
  | 'pull-requests'
  | 'ci'
  | 'workstreams'
  | 'deployments'
  | 'work-items';

export type ActivitySourceKind = 't3' | 'gh' | 'deploy' | 'ci' | 'ado' | 'workstreams';

export type ActivitySeverity = 'info' | 'success' | 'warning' | 'error';
export type ActivityStatus = 'open' | 'resolved' | 'superseded';
export type ActivityRead = 'unread' | 'read' | 'dismissed';
export type ActivityReadReason =
  | 'user'
  | 'action'
  | 'viewed'
  | 'seen-in-t3'
  | 'bulk'
  | 'rolled-up'
  | 'phone';
export type ActivityCoverage = 'live' | 'catch-up';

/** `source` is the roll-up the store writes when old updates fold. */
export type ActivityEntityKind =
  | 'thread'
  | 'pr'
  | 'deployment'
  | 'workitem'
  | 'ci-group'
  | 'workstream'
  | 'source';

export interface ActivityEntity {
  kind: ActivityEntityKind;
  /**
   * Scoped so two hosts or two repositories never meet:
   * `t3:<hostId>:thread:<rawId>`, `gh:<owner>/<repo>#<n>`,
   * `deploy:<owner>/<repo>:<deploymentId>`, `ado:<org>/<project>:<id>`,
   * `ci:<groupId>`, `workstream:<documentId>`.
   */
  key: string;
  title: string;
  url: string | null;
}

export interface ActivityLinks {
  itemIds: number[];
  prUrls: string[];
  workstreamIds: string[];
  ciGroupIds: string[];
}

export type ActionTarget =
  | { kind: 'answer'; hostId: string; threadId: string; requestId: string; option: string | null }
  | { kind: 'approve-plan'; hostId: string; threadId: string; runId: string }
  | { kind: 'open-thread'; hostId: string; threadId: string }
  | { kind: 'open-item'; itemId: number }
  | { kind: 'open-pr'; owner: string; repo: string; number: number; tab?: 'checks' | 'reviews' }
  | { kind: 'review-pr'; owner: string; repo: string; number: number }
  | { kind: 'fix-checks'; owner: string; repo: string; number: number; headSha: string }
  | { kind: 'merge'; owner: string; repo: string; number: number; headSha: string }
  | { kind: 'open-ci-group'; scope: string; groupId: string }
  | { kind: 'open-workstream'; id: string; tab?: string }
  | { kind: 'open-url'; url: string };

export interface ActivityEntry {
  /** `${sourceId}|${nativeKey}`: the same fact always gets the same id. */
  id: string;
  schema: 1;
  sourceId: string;
  entity: ActivityEntity;
  category: ActivityCategory;
  severity: ActivitySeverity;
  needsYou: boolean;
  status: ActivityStatus;
  /** An entry id or a short reason ("answered", "checks passed"). */
  resolvedBy: string | null;
  /** When it happened, from the source. */
  sourceAt: string | null;
  observedAt: string;
  coverage: ActivityCoverage;
  /** One sentence, at most 160 characters. */
  summary: string;
  /** At most 600 characters. */
  detail: string | null;
  action: ActionTarget | null;
  links: ActivityLinks;
  read: ActivityRead;
  readReason: ActivityReadReason | null;
  readAt: string | null;
  /** Bumps on every change, for optimistic writes from two windows. */
  version: number;
}

/** An entry as derivation produces it: Rust owns read state and version. */
export type NewActivityEntry = Omit<ActivityEntry, 'read' | 'readReason' | 'readAt' | 'version'>;

/** Later facts for an entry that already exists. Never touches read state. */
export interface ActivityEnrichment {
  id: string;
  summary?: string;
  detail?: string | null;
  action?: ActionTarget | null;
}

/**
 * Closes open entries. `ids` names them; `entityKey` with `categories`
 * closes every open entry of that entity in those categories. Applies to
 * entries that existed before the commit, never to ones it inserts.
 */
export interface ActivityResolution {
  ids: string[];
  entityKey: string | null;
  categories: ActivityCategory[];
  status: Exclude<ActivityStatus, 'open'>;
  resolvedBy: string;
}

/** Unread entries of an entity with `sourceAt <= before` become read. */
export interface ActivitySeenMark {
  entityKey: string;
  before: string;
  reason: Extract<ActivityReadReason, 'seen-in-t3' | 'viewed'>;
}

export type ActivityChannel = 'popup' | 'push';

export interface ActivityOutboxRequest {
  entryId: string;
  channel: ActivityChannel;
}

/** What one derivation produces; `ingest.ts` turns it into a commit. */
export interface DeriveResult<B> {
  baseline: B;
  entries: NewActivityEntry[];
  enrichments: ActivityEnrichment[];
  resolutions: ActivityResolution[];
  seen: ActivitySeenMark[];
}

/** Every derivation gets the same context besides its observation. */
export interface DeriveContext {
  sourceId: string;
  /** ISO time of this observation. */
  now: string;
  coverage: ActivityCoverage;
  /** True for the source's first commit: write the baseline, add nothing. */
  seed: boolean;
  /** When the source was seeded; entities first seen later count only when created after it. */
  seededAt: string | null;
}

export const SUMMARY_LIMIT = 160;
export const DETAIL_LIMIT = 600;
export const UNREAD_CAPACITY = 5000;
