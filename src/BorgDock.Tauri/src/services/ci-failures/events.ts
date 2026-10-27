import { factsOf } from '@/stores/ci-failures-store';
import { relatednessOf } from './hypothesis';
import type { CiGroupSummary } from './types';

/**
 * What changed about a group, as notifications and the activity digest (#88)
 * read it. The id is stable per transition, so replaying the same snapshots
 * never repeats an event.
 */
export type CiFailureEventKind =
  | 'group-grew'
  | 'owner-stale'
  | 'fix-merged'
  | 'seen-after-fix'
  | 'resolved';

export interface CiFailureEvent {
  id: string;
  kind: CiFailureEventKind;
  groupId: string;
  scope: string;
  title: string;
  prNumbers: number[];
  at: string;
}

export interface EventContext {
  /** Shared, unowned groups notify once they reach this many PRs. */
  threshold: number;
  /** Whether a group's owner is stale right now (live thread status included). */
  ownerStale: (group: CiGroupSummary) => boolean;
  now: Date;
}

function event(
  kind: CiFailureEventKind,
  group: CiGroupSummary,
  key: string | number,
  now: Date,
): CiFailureEvent {
  return {
    id: `${group.id}:${kind}:${key}`,
    kind,
    groupId: group.id,
    scope: group.scope,
    title: group.title,
    prNumbers: group.prNumbers,
    at: now.toISOString(),
  };
}

/** The transitions from `previous` to `next`. Pure. */
export function eventsBetween(
  previous: readonly CiGroupSummary[],
  next: readonly CiGroupSummary[],
  context: EventContext,
): CiFailureEvent[] {
  const before = new Map(previous.map((g) => [g.id, g]));
  const events: CiFailureEvent[] = [];
  for (const group of next) {
    const old = before.get(group.id);
    const shared = group.maxTier === 'high' && relatednessOf(factsOf(group)) === 'shared';
    const reached = group.prNumbers.length >= context.threshold;
    const wasBelow = !old || old.prNumbers.length < context.threshold;
    if (shared && reached && wasBelow && !group.claim && group.status === 'active') {
      events.push(event('group-grew', group, context.threshold, context.now));
    }
    if (
      group.claim &&
      context.ownerStale(group) &&
      !(old?.claim && old.claim.id === group.claim.id && context.ownerStale(old))
    ) {
      events.push(
        event('owner-stale', group, `${group.claim.id}:${group.claim.revision}`, context.now),
      );
    }
    if (group.fixMergedAt && !old?.fixMergedAt && group.status !== 'resolved') {
      events.push(event('fix-merged', group, group.fixMergedAt, context.now));
    }
    if (
      group.fixMergedAt &&
      group.lastObservedAt > group.fixMergedAt &&
      !(old?.fixMergedAt && old.lastObservedAt > old.fixMergedAt)
    ) {
      events.push(event('seen-after-fix', group, group.lastObservedAt, context.now));
    }
    if (group.status === 'resolved' && old && old.status !== 'resolved') {
      events.push(event('resolved', group, group.revision, context.now));
    }
  }
  return events;
}

type Listener = (event: CiFailureEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to group changes in this window (the main window's runtime publishes them). */
export function onCiFailureEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Remembers the last snapshot and the events already published. The first
 * snapshot only sets the baseline: what was already true at startup is not
 * news.
 */
export class CiEventTracker {
  private previous: readonly CiGroupSummary[] | null = null;
  private readonly published = new Set<string>();

  update(groups: readonly CiGroupSummary[], context: EventContext): CiFailureEvent[] {
    const previous = this.previous;
    this.previous = groups;
    if (previous === null) return [];
    const fresh = eventsBetween(previous, groups, context).filter((e) => !this.published.has(e.id));
    for (const e of fresh) {
      this.published.add(e.id);
      for (const listener of listeners) listener(e);
    }
    return fresh;
  }
}
