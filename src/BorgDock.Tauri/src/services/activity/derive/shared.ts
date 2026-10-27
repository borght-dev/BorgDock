import { clipDetail, summary } from '../copy';
import { entryId, normalizeTime } from '../sources';
import type {
  ActionTarget,
  ActivityCategory,
  ActivityEntity,
  ActivityLinks,
  ActivityResolution,
  ActivitySeverity,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';

export const NO_LINKS: ActivityLinks = {
  itemIds: [],
  prUrls: [],
  workstreamIds: [],
  ciGroupIds: [],
};

/** An entity the baseline lost sight of is forgotten after this long. */
export const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface EntryFacts {
  nativeKey: string;
  entity: ActivityEntity;
  category: ActivityCategory;
  severity: ActivitySeverity;
  needsYou: boolean;
  sourceAt: string | null | undefined;
  summary: string;
  detail?: string | null;
  action?: ActionTarget | null;
  links?: Partial<ActivityLinks>;
}

export function makeEntry(ctx: DeriveContext, facts: EntryFacts): NewActivityEntry {
  return {
    id: entryId(ctx.sourceId, facts.nativeKey),
    schema: 1,
    sourceId: ctx.sourceId,
    entity: facts.entity,
    category: facts.category,
    severity: facts.severity,
    needsYou: facts.needsYou,
    status: 'open',
    resolvedBy: null,
    sourceAt: normalizeTime(facts.sourceAt),
    observedAt: ctx.now,
    coverage: ctx.coverage,
    summary: summary(facts.summary),
    detail: clipDetail(facts.detail),
    action: facts.action ?? null,
    links: { ...NO_LINKS, ...facts.links },
  };
}

export function resolveIds(
  ctx: DeriveContext,
  nativeKeys: readonly string[],
  resolvedBy: string,
  status: ActivityResolution['status'] = 'resolved',
): ActivityResolution {
  return {
    ids: nativeKeys.map((key) => entryId(ctx.sourceId, key)),
    entityKey: null,
    categories: [],
    status,
    resolvedBy,
  };
}

export function resolveCategories(
  entityKey: string,
  categories: ActivityCategory[],
  resolvedBy: string,
  status: ActivityResolution['status'] = 'resolved',
): ActivityResolution {
  return { ids: [], entityKey, categories, status, resolvedBy };
}

/**
 * An entity seen for the first time after the source seeded counts only
 * when it was created after the seed: a source that comes back with
 * hundreds of things it never reported stays quiet.
 */
export function createdAfterSeed(
  ctx: DeriveContext,
  createdAt: string | null | undefined,
): boolean {
  const created = normalizeTime(createdAt);
  return !!created && !!ctx.seededAt && created > ctx.seededAt;
}

export function later(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeTime(a);
  const right = normalizeTime(b);
  return !!left && (!right || left > right);
}

/** Entities missing from a complete observation stay, marked, until they are long gone. */
export function keepMissing<T extends { missingSince?: string }>(
  ctx: DeriveContext,
  previous: Readonly<Record<string, T>>,
  present: ReadonlySet<string>,
  complete: boolean,
): Record<string, T> {
  const kept: Record<string, T> = {};
  const cutoff = new Date(new Date(ctx.now).getTime() - FORGET_AFTER_MS).toISOString();
  for (const [key, value] of Object.entries(previous)) {
    if (present.has(key)) continue;
    if (!complete) {
      kept[key] = value;
      continue;
    }
    const missingSince = value.missingSince ?? ctx.now;
    if (missingSince < cutoff) continue;
    kept[key] = { ...value, missingSince };
  }
  return kept;
}

export function emptyResult<B>(baseline: B): DeriveResult<B> {
  return { baseline, entries: [], enrichments: [], resolutions: [], seen: [] };
}

/** A short, stable fingerprint for comparing text the baseline need not keep. */
export function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
