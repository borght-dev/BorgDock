import { rawId } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import type { T3Session } from '@/stores/t3-session-store';
import type { CiClaim } from './types';

/** Who can own an investigation. */
export type OwnerKind = 'me' | 't3' | 'terminal' | 'github_issue';

/**
 * What BorgDock can tell about an owner right now. `stale` means the claim
 * should be confirmed or released: the thread finished or failed, its host
 * has been offline a while, or a lease without a status ran out.
 */
export interface OwnerStatus {
  label: string;
  stale: boolean;
  /** A settled T3 owner: "Investigation finished?" rather than "Still on it?". */
  finished: boolean;
  /** Where the status came from, so the card can say which guarantee applies. */
  source: 'thread' | 'session' | 'lease' | 'issue' | 'claim';
}

/** A host that has been offline this long makes its thread's claim stale. */
const OFFLINE_GRACE_MS = 30 * 60_000;
/** A claim still `pending:` this long after it was taken belongs to a launch that died. */
const PENDING_GRACE_MS = 10 * 60_000;

export interface OwnerSources {
  threads: readonly AgentThread[];
  sessions: readonly T3Session[];
  now: Date;
}

function leaseStatus(claim: CiClaim, now: Date, label: string): OwnerStatus {
  const expired = !!claim.leaseUntil && Date.parse(claim.leaseUntil) <= now.getTime();
  return {
    label: expired ? 'lease ran out' : label,
    stale: expired,
    finished: false,
    source: 'lease',
  };
}

function threadStatus(thread: AgentThread, now: Date): OwnerStatus {
  if (!thread.available) {
    const quietFor = now.getTime() - Date.parse(thread.lastActivityAt || thread.updatedAt || '');
    return {
      label: `${thread.hostLabel} offline`,
      stale: Number.isFinite(quietFor) && quietFor > OFFLINE_GRACE_MS,
      finished: false,
      source: 'thread',
    };
  }
  switch (thread.status) {
    case 'running':
      return { label: 'running', stale: false, finished: false, source: 'thread' };
    case 'settled':
      return { label: 'finished', stale: true, finished: true, source: 'thread' };
    case 'failed':
      return { label: 'failed', stale: true, finished: false, source: 'thread' };
    default:
      return { label: 'waiting for you', stale: false, finished: false, source: 'thread' };
  }
}

function sessionStatus(session: T3Session): OwnerStatus {
  if (session.status === 'settled') {
    return { label: 'finished', stale: true, finished: true, source: 'session' };
  }
  if (session.status === 'running') {
    return { label: 'running', stale: false, finished: false, source: 'session' };
  }
  return { label: 'waiting for you', stale: false, finished: false, source: 'session' };
}

/**
 * The owner's status: Dispatch's view of the thread first (every host), the
 * local session list next, a lease as the floor.
 */
export function ownerStatusOf(claim: CiClaim, sources: OwnerSources): OwnerStatus {
  if (claim.state === 'launch_failed') {
    return { label: 'launch failed', stale: true, finished: false, source: 'claim' };
  }
  if (claim.ownerKind === 'github_issue') {
    return {
      label: claim.state === 'stale' ? 'issue closed or unassigned' : 'tracked on GitHub',
      stale: claim.state === 'stale',
      finished: false,
      source: 'issue',
    };
  }
  if (claim.ownerRef.startsWith('pending:')) {
    const waited = sources.now.getTime() - Date.parse(claim.claimedAt);
    return waited > PENDING_GRACE_MS
      ? { label: 'launch never finished', stale: true, finished: false, source: 'claim' }
      : { label: 'starting', stale: false, finished: false, source: 'claim' };
  }
  if (claim.ownerKind === 't3') {
    const thread = sources.threads.find((t) => t.id === claim.ownerRef);
    if (thread) return threadStatus(thread, sources.now);
    const raw = rawId(claim.hostId ?? 'local', claim.ownerRef);
    const session = sources.sessions.find((s) => s.threadId === raw);
    if (session) return sessionStatus(session);
  }
  if (claim.state === 'stale') {
    return { label: 'needs a check-in', stale: true, finished: false, source: 'claim' };
  }
  return leaseStatus(
    claim,
    sources.now,
    claim.ownerKind === 'terminal' ? 'terminal session' : 'you',
  );
}

/** When a claim made now should be checked on, for owners without a status. */
export function leaseUntil(now: Date, hours: number): string {
  return new Date(now.getTime() + Math.max(1, hours) * 60 * 60_000).toISOString();
}

/** How the owner reads on a card: "T3 · CI: checkout 503", "You", "Terminal session". */
export function ownerLabel(claim: CiClaim): string {
  switch (claim.ownerKind as OwnerKind) {
    case 't3':
      return `T3 · ${claim.ownerLabel ?? 'thread'}`;
    case 'terminal':
      return claim.ownerLabel ? `Terminal · ${claim.ownerLabel}` : 'Terminal session';
    case 'github_issue':
      return claim.ownerLabel ?? 'GitHub issue';
    default:
      return claim.ownerLabel ? `You · ${claim.ownerLabel}` : 'You';
  }
}
