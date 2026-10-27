import {
  type CiFailureEvent,
  type CiFailureEventKind,
  eventsBetween,
} from '@/services/ci-failures/events';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { sentence } from '../copy';
import { entityKey } from '../sources';
import type {
  ActivityCategory,
  ActivityResolution,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import { createdAfterSeed, emptyResult, makeEntry, resolveCategories } from './shared';

export interface CiObservation {
  /** CI failures' own scope (the default account left empty). */
  scope: string;
  groups: CiGroupSummary[];
  /** Shared, unowned groups count once they reach this many PRs. */
  threshold: number;
  ownerStale: (group: CiGroupSummary) => boolean;
  /** Claims BorgDock made here (me, a T3 thread or a terminal), not a tracking issue. */
  ownedByMe: (group: CiGroupSummary) => boolean;
  /** My open PRs in the repository. */
  myPrs: readonly number[];
  /** Those of my PRs whose checks are red right now. */
  myRedPrs: readonly number[];
}

export interface CiBaseline {
  /** The previous summaries, as `eventsBetween` compares them. */
  groups: CiGroupSummary[];
}

const CATEGORY: Record<CiFailureEventKind, ActivityCategory> = {
  'group-grew': 'ci.group-grew',
  'owner-stale': 'ci.owner-stale',
  'fix-merged': 'ci.fix-merged',
  'seen-after-fix': 'ci.seen-after-fix',
  resolved: 'ci.resolved',
};

const OPEN_WHILE_UNRESOLVED: ActivityCategory[] = [
  'ci.group-grew',
  'ci.owner-stale',
  'ci.fix-merged',
  'ci.seen-after-fix',
];

function mineIn(group: CiGroupSummary, prs: readonly number[]): boolean {
  return group.prNumbers.some((number) => prs.includes(number));
}

function entryOf(
  ctx: DeriveContext,
  observation: CiObservation,
  event: CiFailureEvent,
  group: CiGroupSummary,
): NewActivityEntry {
  const category = CATEGORY[event.kind];
  const needsYou =
    event.kind === 'fix-merged' ? mineIn(group, observation.myRedPrs) : event.kind !== 'resolved';
  const sourceAt =
    event.kind === 'fix-merged'
      ? group.fixMergedAt
      : event.kind === 'seen-after-fix' || event.kind === 'group-grew'
        ? group.lastObservedAt
        : null;
  const summary = {
    'group-grew': () => sentence.ciGroupGrew(group.title, group.prNumbers.length),
    'owner-stale': () => sentence.ciOwnerStale(group.title, group.claim?.ownerLabel ?? null),
    'fix-merged': () => sentence.ciFixMerged(group.title),
    'seen-after-fix': () => sentence.ciSeenAfterFix(group.title),
    resolved: () => sentence.ciResolved(group.title),
  }[event.kind]();
  return makeEntry(ctx, {
    nativeKey: event.id,
    entity: { kind: 'ci-group', key: entityKey.ciGroup(group.id), title: group.title, url: null },
    links: { ciGroupIds: [group.id] },
    category,
    severity:
      event.kind === 'resolved' ? 'success' : event.kind === 'fix-merged' ? 'info' : 'warning',
    needsYou,
    sourceAt,
    summary,
    detail:
      group.prNumbers.length > 0 ? `PRs: ${group.prNumbers.map((n) => `#${n}`).join(', ')}` : null,
    action: { kind: 'open-ci-group', scope: observation.scope, groupId: group.id },
  });
}

/**
 * `eventsBetween` against a baseline that survives restarts, so a fix
 * merged while BorgDock was closed still shows up. Events count when one of
 * my PRs is in the group, when I own its claim, or when shared work crossed
 * the threshold with nobody on it.
 */
export function deriveCi(
  ctx: DeriveContext,
  baseline: CiBaseline | null,
  observation: CiObservation,
): DeriveResult<CiBaseline> {
  const present = new Set(observation.groups.map((group) => group.id));
  const kept = (baseline?.groups ?? []).filter(
    (group) => !present.has(group.id) && group.status !== 'resolved',
  );
  const result = emptyResult<CiBaseline>({ groups: [...observation.groups, ...kept] });
  if (ctx.seed) return result;

  const before = new Map((baseline?.groups ?? []).map((group) => [group.id, group]));
  // A group the baseline never saw, but older than the seed, was there all
  // along: comparing it with itself makes it quiet.
  const previous = observation.groups
    .map(
      (group) =>
        before.get(group.id) ?? (createdAfterSeed(ctx, group.firstObservedAt) ? null : group),
    )
    .filter((group): group is CiGroupSummary => group !== null);
  const events = eventsBetween(previous, observation.groups, {
    threshold: observation.threshold,
    ownerStale: observation.ownerStale,
    now: new Date(ctx.now),
  });
  const byId = new Map(observation.groups.map((group) => [group.id, group]));
  const entries = events.flatMap((event) => {
    const group = byId.get(event.groupId);
    if (!group) return [];
    const audience =
      mineIn(group, observation.myPrs) ||
      observation.ownedByMe(group) ||
      event.kind === 'group-grew';
    return audience ? [entryOf(ctx, observation, event, group)] : [];
  });

  const resolutions: ActivityResolution[] = [];
  for (const group of observation.groups) {
    const old = before.get(group.id);
    if (!old) continue;
    const key = entityKey.ciGroup(group.id);
    if (group.status === 'resolved' && old.status !== 'resolved') {
      resolutions.push(resolveCategories(key, OPEN_WHILE_UNRESOLVED, 'resolved'));
      continue;
    }
    if (group.claim && !old.claim) {
      resolutions.push(resolveCategories(key, ['ci.group-grew'], 'claimed'));
    }
    const claimMoved =
      old.claim &&
      (!group.claim ||
        group.claim.id !== old.claim.id ||
        group.claim.revision !== old.claim.revision);
    if (claimMoved && !observation.ownerStale(group)) {
      resolutions.push(
        resolveCategories(key, ['ci.owner-stale'], group.claim ? 'renewed' : 'released'),
      );
    }
  }
  return { ...result, entries, resolutions };
}
