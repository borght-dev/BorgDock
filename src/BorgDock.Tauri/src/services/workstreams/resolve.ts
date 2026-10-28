import { scopedId } from '@/services/dispatch/hosts';
import {
  type AgentThread,
  type ItemOverview,
  NEEDS_YOU,
  type PullRequestState,
  THREAD_STATUS_LABEL,
  type Tone,
} from '@/services/dispatch/types';
import type { LookupResult } from '@/services/github/pr-lookup';
import type { HostStatus, SourceStatus } from '@/stores/dispatch-store';
import { prRefFromUrl, shortIdentity, sourceUrl } from './identity';
import type { AdoItemRef, GitHubPrRef, LinkRef, Member, RefKey, T3ThreadRef } from './types';

/**
 * What a member's source says now. Every reference has its own freshness:
 * a workstream can hold a live pull request, a work item as of ten minutes
 * ago and a thread on a host that is offline, side by side.
 */

export type Freshness = 'live' | 'stale' | 'offline' | 'missing' | 'not-connected' | 'unread';

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  live: 'Live',
  stale: 'Out of date',
  offline: 'Offline',
  missing: 'Missing',
  'not-connected': 'Not connected',
  unread: 'Not read yet',
};

/** A pull request as the workstream needs it, from BorgDock's poll or a lookup. */
export interface PrFacts {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  baseRefName: string | null;
  headRefName: string | null;
  approved: boolean;
  checks: 'passed' | 'failed' | 'pending' | null;
  conflicting: boolean;
  /** Polled by BorgDock: it opens inside BorgDock. */
  polled: boolean;
  repositoryId: string | null;
  /** `owner/name` now, when GitHub reports one that differs from the reference's. */
  renamedTo: string | null;
}

/** The last seen metadata of a reference, kept per device. */
export interface CachedMeta {
  title: string;
  stateLabel: string;
  at: string;
}

export interface ResolvedMember {
  member: Member;
  freshness: Freshness;
  /** Why it isn't live: the host is offline, the organization isn't set up. */
  reason: string | null;
  /** When the source last said what is shown. */
  asOf: string | null;
  title: string;
  /** "Open", "Merged", "Development In Progress", "Agent asks". */
  stateLabel: string;
  tone: Tone | null;
  /** Done at its source: merged or closed, Resolved or later, settled. A resolved member blocks nothing. */
  resolved: boolean;
  /** When it got resolved, as far as the source says. */
  resolvedAt: string | null;
  /** Last activity at the source. */
  activityAt: string | null;
  needsYou: boolean;
  url: string;
  identity: string;
  item?: ItemOverview;
  /** An item's own pull request (not a shared plan PR), as BorgDock reads it now. */
  delivery?: { number: number; read: PrRead } | null;
  pr?: PrFacts;
  thread?: AgentThread;
  hostLabel?: string;
}

export interface PolledPullRequest extends PrFacts {
  updatedAt: string | null;
  /** When its repository last answered a poll. */
  polledAt: string | null;
}

export interface SourceSnapshot {
  now: number;
  ado: {
    organization: string | null;
    status: SourceStatus;
    pollMs: number;
  };
  /** Every item Dispatch built, its own and the context ones, by id. */
  items: ReadonlyMap<number, ItemOverview>;
  /** The items only workstreams read (`overview.context`), and how their last read went. */
  contextIds: ReadonlySet<number>;
  contextStatus: SourceStatus;
  missingItemIds: ReadonlySet<number>;
  gitHub: {
    configured: boolean;
    lastPollAt: string | null;
    pollMs: number;
  };
  /** Pull requests BorgDock polls, by `owner/repo#number` in lower case. */
  polled: ReadonlyMap<string, PolledPullRequest>;
  /** Pull requests read by number, by the same key. */
  lookedUp: ReadonlyMap<string, LookupResult>;
  threads: ReadonlyMap<string, AgentThread>;
  hosts: readonly HostStatus[];
  /** Hosts configured in settings, by id. */
  configuredHosts: ReadonlySet<string>;
  cache: Readonly<Record<RefKey, CachedMeta>>;
}

/** A source counts as current while it answered within this many poll intervals. */
const FRESH_POLLS = 3;

function age(now: number, at: string | null): number {
  return at ? now - Date.parse(at) : Number.POSITIVE_INFINITY;
}

function shortTime(at: string | null): string {
  if (!at) return '';
  const date = new Date(at);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "as of 26 Oct 10:42". */
export function asOfLabel(resolved: Pick<ResolvedMember, 'freshness' | 'asOf' | 'reason'>): string {
  switch (resolved.freshness) {
    case 'live':
      return 'Live';
    case 'stale':
      return resolved.asOf ? `As of ${shortTime(resolved.asOf)}` : 'Out of date';
    case 'offline':
      return resolved.asOf ? `Offline since ${shortTime(resolved.asOf)}` : 'Offline';
    default:
      return FRESHNESS_LABEL[resolved.freshness];
  }
}

function base(member: Member, snapshot: SourceSnapshot): ResolvedMember {
  const cached = snapshot.cache[member.key];
  return {
    member,
    freshness: 'unread',
    reason: null,
    asOf: cached?.at ?? null,
    title: cached?.title || member.label || shortIdentity(member.ref),
    stateLabel: cached?.stateLabel ?? '',
    tone: null,
    resolved: false,
    resolvedAt: null,
    activityAt: null,
    needsYou: false,
    url: sourceUrl(member.ref),
    identity: shortIdentity(member.ref),
  };
}

export const PR_STATE_LABEL: Record<PullRequestState, string> = {
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
  unknown: 'Unknown',
};

function prKey(ref: Pick<GitHubPrRef, 'owner' | 'repo' | 'number'>): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();
}

function prTone(pr: PrFacts): Tone {
  if (pr.state === 'merged') return 'ok';
  if (pr.state === 'closed') return 'mute';
  if (pr.checks === 'failed' || pr.conflicting) return 'bad';
  if (pr.checks === 'pending') return 'run';
  return pr.isDraft ? 'mute' : 'warn';
}

/** "Open", "Draft", "Checks fail", "Merge conflict", "Merged". */
function prStateLabel(pr: PrFacts): string {
  if (pr.state !== 'open') return PR_STATE_LABEL[pr.state];
  if (pr.conflicting) return 'Merge conflict';
  if (pr.checks === 'failed') return 'Checks fail';
  if (pr.isDraft) return 'Draft';
  if (pr.checks === 'pending') return 'Checks running';
  return pr.approved ? 'Approved' : 'Open';
}

function withPr(resolved: ResolvedMember, pr: PrFacts, activityAt: string | null): ResolvedMember {
  return {
    ...resolved,
    title: pr.title || resolved.title,
    stateLabel: prStateLabel(pr),
    tone: prTone(pr),
    resolved: pr.state === 'merged' || pr.state === 'closed',
    resolvedAt: pr.mergedAt ?? pr.closedAt,
    activityAt: activityAt ?? pr.mergedAt ?? pr.closedAt,
    url: pr.url || resolved.url,
    pr,
  };
}

/** How long a looked-up pull request counts as current: an open one changes, a merged one doesn't. */
const LOOKUP_FRESH_MS: Record<PullRequestState, number> = {
  open: 15 * 60_000,
  closed: 3 * 60 * 60_000,
  merged: Number.POSITIVE_INFINITY,
  unknown: 15 * 60_000,
};

/** What BorgDock knows of one pull request now, from its poll or a lookup. */
export interface PrRead {
  facts: PrFacts | null;
  freshness: Freshness;
  asOf: string | null;
  reason: string | null;
  activityAt: string | null;
}

/** Read one pull request out of the snapshot: polled first, then looked up. */
export function readPullRequest(
  ref: Pick<GitHubPrRef, 'owner' | 'repo' | 'number'>,
  snapshot: SourceSnapshot,
): PrRead {
  const unread: PrRead = {
    facts: null,
    freshness: 'unread',
    asOf: null,
    reason: null,
    activityAt: null,
  };
  if (!snapshot.gitHub.configured) {
    return { ...unread, freshness: 'not-connected', reason: 'GitHub is not set up.' };
  }
  const key = prKey(ref);
  const polled = snapshot.polled.get(key);
  if (polled) {
    // A repository that failed its poll keeps its last pull requests in the list.
    const fresh = age(snapshot.now, polled.polledAt) < FRESH_POLLS * snapshot.gitHub.pollMs;
    return {
      facts: polled,
      freshness: fresh ? 'live' : 'stale',
      asOf: polled.polledAt,
      reason: fresh ? null : `BorgDock has not read ${ref.owner}/${ref.repo} for a while.`,
      activityAt: polled.updatedAt,
    };
  }
  const looked = snapshot.lookedUp.get(key);
  if (!looked) return unread;
  switch (looked.status) {
    case 'found': {
      const pr = looked.pullRequest;
      const [owner, repo] = pr.nameWithOwner.split('/');
      const renamed =
        pr.nameWithOwner &&
        pr.nameWithOwner.toLowerCase() !== `${ref.owner}/${ref.repo}`.toLowerCase();
      const facts: PrFacts = {
        owner: owner ?? ref.owner,
        repo: repo ?? ref.repo,
        number: pr.number,
        url: pr.url,
        title: pr.title,
        state: pr.state,
        isDraft: pr.isDraft,
        mergedAt: pr.mergedAt,
        closedAt: pr.closedAt,
        baseRefName: pr.baseRefName,
        headRefName: pr.headRefName,
        approved: pr.approved,
        checks: pr.checks,
        conflicting: pr.conflicting,
        polled: false,
        repositoryId: pr.repositoryId,
        renamedTo: renamed ? pr.nameWithOwner : null,
      };
      const current = snapshot.now - looked.readAt <= LOOKUP_FRESH_MS[pr.state];
      const live = !looked.failing && current;
      return {
        facts,
        freshness: live ? 'live' : 'stale',
        asOf: new Date(looked.readAt).toISOString(),
        reason: live ? null : (looked.failing ?? 'Not read again since.'),
        activityAt: null,
      };
    }
    case 'missing':
      return looked.confirmed
        ? { ...unread, freshness: 'missing', reason: 'GitHub has no such pull request (any more).' }
        : unread;
    case 'no-access':
      return { ...unread, freshness: 'not-connected', reason: looked.error };
    case 'error':
      return { ...unread, freshness: 'offline', reason: looked.error };
  }
}

function resolvePullRequest(
  member: Member,
  ref: GitHubPrRef,
  snapshot: SourceSnapshot,
): ResolvedMember {
  const start = base(member, snapshot);
  const read = readPullRequest(ref, snapshot);
  const resolved = {
    ...start,
    freshness: read.freshness,
    reason: read.reason,
    asOf: read.asOf ?? start.asOf,
  };
  return read.facts ? withPr(resolved, read.facts, read.activityAt) : resolved;
}

function resolveItem(member: Member, ref: AdoItemRef, snapshot: SourceSnapshot): ResolvedMember {
  const start = base(member, snapshot);
  const organization = snapshot.ado.organization;
  if (!organization) {
    return { ...start, freshness: 'not-connected', reason: 'Azure DevOps is not set up.' };
  }
  if (organization.toLowerCase() !== ref.organization.toLowerCase()) {
    return {
      ...start,
      freshness: 'not-connected',
      reason: `BorgDock is set up for the ${organization} organization, not ${ref.organization}.`,
    };
  }
  const overview = snapshot.items.get(ref.id);
  if (!overview) {
    if (snapshot.missingItemIds.has(ref.id)) {
      return {
        ...start,
        freshness: 'missing',
        reason: 'Azure DevOps did not return it: deleted, or out of reach.',
      };
    }
    if (!snapshot.ado.status.ok && snapshot.ado.status.at) {
      return {
        ...start,
        freshness: 'offline',
        reason: snapshot.ado.status.error,
        asOf: snapshot.ado.status.at,
      };
    }
    return start;
  }
  const status = snapshot.contextIds.has(ref.id) ? snapshot.contextStatus : snapshot.ado.status;
  const fresh = status.ok && age(snapshot.now, status.at) < FRESH_POLLS * snapshot.ado.pollMs;
  const item = overview.item;
  const own = overview.pullRequest && !overview.pullRequest.shared ? overview.pullRequest : null;
  const ownRef = own ? prRefFromUrl(own.url) : null;
  const delivery =
    own && ownRef ? { number: own.number, read: readPullRequest(ownRef, snapshot) } : null;
  const resolvedState = item.stateCategory === 'Resolved' || item.stateCategory === 'Completed';
  return {
    ...start,
    freshness: fresh ? 'live' : status.ok ? 'stale' : 'offline',
    reason: fresh ? null : (status.error ?? 'Azure DevOps has not answered for a while.'),
    asOf: status.at,
    title: item.title,
    stateLabel: item.state,
    tone: overview.verdict.tone,
    resolved: resolvedState,
    resolvedAt: resolvedState ? item.changedAt : null,
    activityAt: item.changedAt,
    needsYou: overview.verdict.tone === 'bad',
    url: item.url,
    item: overview,
    delivery,
  };
}

function threadTone(thread: AgentThread): Tone {
  if (!thread.open) return 'mute';
  if (NEEDS_YOU.includes(thread.status)) return 'bad';
  return 'run';
}

function resolveThread(member: Member, ref: T3ThreadRef, snapshot: SourceSnapshot): ResolvedMember {
  const start = base(member, snapshot);
  const host =
    snapshot.hosts.find(
      (h) => h.environmentId === ref.environmentId && snapshot.configuredHosts.has(h.id),
    ) ?? null;
  if (!host) {
    const linkedFrom = snapshot.hosts.find((h) => h.id === ref.hostId);
    if (!snapshot.configuredHosts.has(ref.hostId) || !linkedFrom) {
      return {
        ...start,
        freshness: 'not-connected',
        reason: 'No T3 host BorgDock follows runs the install this thread lives on.',
      };
    }
    if (linkedFrom.environmentId && linkedFrom.environmentId !== ref.environmentId) {
      return {
        ...start,
        freshness: 'not-connected',
        reason: `${linkedFrom.label} runs another T3 install now. Relink the thread.`,
        hostLabel: linkedFrom.label,
      };
    }
    if (!linkedFrom.ok) {
      return {
        ...start,
        identity: `Thread on ${linkedFrom.label}`,
        freshness: 'offline',
        reason: `${linkedFrom.label} is offline.`,
        asOf: linkedFrom.at,
        hostLabel: linkedFrom.label,
      };
    }
    return { ...start, hostLabel: linkedFrom.label };
  }
  const thread = snapshot.threads.get(scopedId(host.id, ref.threadId));
  if (!thread) {
    if (!host.ok) {
      return {
        ...start,
        identity: `Thread on ${host.label}`,
        freshness: 'offline',
        reason: `${host.label} is offline.`,
        asOf: host.at,
        hostLabel: host.label,
      };
    }
    return {
      ...start,
      identity: `Thread on ${host.label}`,
      freshness: 'missing',
      reason: `T3 on ${host.label} no longer lists it: deleted or archived.`,
      hostLabel: host.label,
    };
  }
  const live = host.ok && thread.available;
  const needsYou = thread.open && NEEDS_YOU.includes(thread.status);
  return {
    ...start,
    freshness: live ? 'live' : 'offline',
    reason: live ? null : `${host.label} is offline.`,
    asOf: live ? host.at : (host.at ?? null),
    title: thread.title || start.title,
    stateLabel: THREAD_STATUS_LABEL[thread.status],
    tone: threadTone(thread),
    resolved: !thread.open,
    resolvedAt: thread.open ? null : thread.lastActivityAt,
    activityAt: thread.lastActivityAt,
    needsYou,
    identity: `${thread.place} on ${host.label}`,
    thread,
    hostLabel: host.label,
  };
}

function resolveLink(member: Member, ref: LinkRef, snapshot: SourceSnapshot): ResolvedMember {
  return {
    ...base(member, snapshot),
    freshness: 'live',
    title: member.label || ref.title,
    stateLabel: '',
    resolved: true,
    url: ref.url,
  };
}

export function resolveMember(member: Member, snapshot: SourceSnapshot): ResolvedMember {
  switch (member.ref.kind) {
    case 'github-pr':
      return resolvePullRequest(member, member.ref, snapshot);
    case 'ado-item':
      return resolveItem(member, member.ref, snapshot);
    case 't3-thread':
      return resolveThread(member, member.ref, snapshot);
    case 'link':
      return resolveLink(member, member.ref, snapshot);
  }
}

/** What to keep in the per-device cache for a member that resolved live. */
export function cacheEntry(resolved: ResolvedMember): CachedMeta | null {
  if (resolved.freshness !== 'live' || resolved.member.ref.kind === 'link') return null;
  return { title: resolved.title, stateLabel: resolved.stateLabel, at: new Date().toISOString() };
}
