import type { ActivityOutboxRequest } from '@/generated/commands';
import { createLogger } from '@/services/logger';
import { useActivityStore } from '@/stores/activity-store';
import * as api from './api';
import { channelsFor } from './policy';
import { SourceQueue } from './sources';
import type {
  ActivityCoverage,
  ActivitySourceKind,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from './types';

const log = createLogger('activity');

export interface SourceDescriptor {
  sourceId: string;
  kind: ActivitySourceKind;
  /** What the source menu and roll-ups call it: "Mac mini", "acme/app (koen)". */
  label: string;
  /** A change starts a new generation: another account, address or install. */
  configKey: string;
  /** How often the source is read; a source down for two intervals catches up. */
  intervalMs?: number;
}

/**
 * How the observation is ordered. `sequence` is the source's own counter
 * (T3's snapshot sequence, the CI store revision); one that goes back means
 * the source was reset. `time` is when the read started.
 */
export type Revision = { sequence: number } | { time: number };

export type Deriver<B, O> = (
  ctx: DeriveContext,
  baseline: B | null,
  observation: O,
) => DeriveResult<B>;

export type IngestOutcome =
  | 'committed'
  | 'unchanged'
  | 'stale'
  | 'dropped'
  | 'rejected'
  | 'failed'
  | 'read-only';

interface SourceState {
  generation: number;
  revision: number | null;
  baseline: unknown;
  baselineText: string | null;
  seededAt: string | null;
  configKey: string;
  label: string;
  committedThisSession: boolean;
  failedSince: number | null;
}

/** Sub-revisions within one sequence (a detail read after the shell read). */
const PER_SEQUENCE = 1000;
const DEFAULT_INTERVAL_MS = 60_000;

const states = new Map<string, SourceState>();
const queue = new SourceQueue();
const committedListeners = new Set<(sourceId: string, inserted: string[]) => void>();
const retries = new Map<string, () => Promise<IngestOutcome>>();
let readOnly = false;

/** Forget what was opened (tests, a reset). */
export function resetActivityIngest(): void {
  states.clear();
  retries.clear();
  readOnly = false;
}

/** Called after every accepted commit that inserted entries; the popup drain listens. */
export function onActivityCommitted(listener: (sourceId: string, inserted: string[]) => void) {
  committedListeners.add(listener);
  return () => committedListeners.delete(listener);
}

/** A read of the source failed; enough of them in a row make the next commit a catch-up. */
export function markSourceFailed(sourceId: string): void {
  const state = states.get(sourceId);
  if (state && state.failedSince === null) state.failedSince = Date.now();
}

async function open(source: SourceDescriptor, reset = false): Promise<SourceState> {
  const opened = await api.openSource({
    sourceId: source.sourceId,
    kind: source.kind,
    label: source.label,
    configKey: source.configKey,
    reset,
  });
  const previous = states.get(source.sourceId);
  const state: SourceState = {
    generation: opened.generation,
    revision: opened.revision,
    baseline: opened.baseline ? JSON.parse(opened.baseline) : null,
    baselineText: opened.baseline,
    seededAt: opened.seededAt,
    configKey: source.configKey,
    label: source.label,
    committedThisSession:
      previous?.generation === opened.generation ? previous.committedThisSession : false,
    failedSince: previous?.failedSince ?? null,
  };
  states.set(source.sourceId, state);
  return state;
}

async function stateFor(source: SourceDescriptor): Promise<SourceState> {
  const known = states.get(source.sourceId);
  if (known && known.configKey === source.configKey && known.label === source.label) return known;
  return open(source);
}

function nextRevision(state: SourceState, revision: Revision): number | 'regressed' | 'stale' {
  if ('time' in revision) {
    if (state.revision !== null && revision.time <= state.revision) return 'stale';
    return revision.time;
  }
  const major = revision.sequence;
  if (state.revision === null) return major * PER_SEQUENCE;
  const storedMajor = Math.floor(state.revision / PER_SEQUENCE);
  if (major < storedMajor) return 'regressed';
  if (major > storedMajor) return major * PER_SEQUENCE;
  const minor = (state.revision % PER_SEQUENCE) + 1;
  return minor < PER_SEQUENCE ? major * PER_SEQUENCE + minor : 'stale';
}

function hasNews(result: DeriveResult<unknown>): boolean {
  return (
    result.entries.length > 0 ||
    result.enrichments.length > 0 ||
    result.resolutions.length > 0 ||
    result.seen.length > 0
  );
}

function outboxOf(entries: readonly NewActivityEntry[]): ActivityOutboxRequest[] {
  return entries.flatMap((entry) =>
    channelsFor(entry).map((channel) => ({ entryId: entry.id, channel })),
  );
}

function coverageOf(source: SourceDescriptor, state: SourceState): ActivityCoverage {
  if (!state.committedThisSession) return 'catch-up';
  const interval = source.intervalMs ?? DEFAULT_INTERVAL_MS;
  return state.failedSince !== null && Date.now() - state.failedSince > 2 * interval
    ? 'catch-up'
    : 'live';
}

async function run<B, O>(
  source: SourceDescriptor,
  revision: Revision,
  derive: Deriver<B, O>,
  observation: O,
): Promise<IngestOutcome> {
  if (readOnly) return 'read-only';
  let state = await stateFor(source);
  let next = nextRevision(state, revision);
  if (next === 'stale') return 'stale';
  if (next === 'regressed') {
    log.warn('activity source went back; seeding again', {
      source: source.sourceId,
      stored: state.revision,
      revision,
    });
    state = await open(source, true);
    next = nextRevision(state, revision);
    if (typeof next !== 'number') return 'stale';
  }

  const now = new Date().toISOString();
  const seed = state.baseline === null;
  const ctx: DeriveContext = {
    sourceId: source.sourceId,
    now,
    coverage: coverageOf(source, state),
    seed,
    seededAt: state.seededAt,
  };
  const result = derive(ctx, state.baseline as B | null, observation);
  const baselineText = JSON.stringify(result.baseline);
  if (!seed && !hasNews(result) && baselineText === state.baselineText) {
    state.committedThisSession = true;
    state.failedSince = null;
    return 'unchanged';
  }

  const committed = await api.commit({
    sourceId: source.sourceId,
    generation: state.generation,
    revision: next,
    seed,
    baseline: baselineText,
    entries: result.entries.map(api.toInput),
    enrichments: result.enrichments.map((enrichment) => ({
      id: enrichment.id,
      ...(enrichment.summary !== undefined ? { summary: enrichment.summary } : {}),
      ...(enrichment.detail !== undefined ? { detail: enrichment.detail } : {}),
      ...(enrichment.action !== undefined ? { action: JSON.stringify(enrichment.action) } : {}),
    })),
    resolutions: result.resolutions,
    seen: result.seen,
    outbox: seed ? [] : outboxOf(result.entries),
  });
  if (!committed.accepted) {
    log.warn('activity commit rejected', { source: source.sourceId, reason: committed.reason });
    // Another window or an older session moved the source on: read it again next time.
    states.delete(source.sourceId);
    return 'rejected';
  }
  state.revision = next;
  state.baseline = result.baseline;
  state.baselineText = baselineText;
  state.seededAt ??= now;
  state.committedThisSession = true;
  state.failedSince = null;
  useActivityStore.getState().setCapacity(committed.capacity);
  if (committed.inserted.length > 0) {
    for (const listener of committedListeners) listener(source.sourceId, committed.inserted);
  }
  return 'committed';
}

/**
 * Derive and commit one observation of one source. One observation is in
 * flight per source; a newer one replaces one that waits. A commit that
 * fails leaves the baseline where it was, so the next observation derives
 * the same transitions again, and stable ids keep them from doubling.
 */
export async function ingest<B, O>(
  source: SourceDescriptor,
  revision: Revision,
  derive: Deriver<B, O>,
  observation: O,
): Promise<IngestOutcome> {
  let outcome: IngestOutcome = 'dropped';
  const attempt = () => run(source, revision, derive, observation);
  const ran = await queue.run(source.sourceId, async () => {
    try {
      outcome = await attempt();
      retries.delete(source.sourceId);
      if (outcome === 'committed') useActivityStore.getState().clearCommitError(source.sourceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/newer BorgDock/.test(message)) {
        readOnly = true;
        useActivityStore.getState().setReadOnly(true);
        outcome = 'read-only';
        return;
      }
      log.error('activity commit failed', error, { source: source.sourceId });
      retries.set(source.sourceId, attempt);
      useActivityStore.getState().setCommitError(source.sourceId, message);
      outcome = 'failed';
    }
  });
  return ran ? outcome : 'dropped';
}

/** The banner's Retry: run each failed observation again. */
export async function retryFailedCommits(): Promise<void> {
  for (const [sourceId, attempt] of [...retries]) {
    await queue.run(sourceId, async () => {
      try {
        await attempt();
        retries.delete(sourceId);
        useActivityStore.getState().clearCommitError(sourceId);
      } catch (error) {
        useActivityStore
          .getState()
          .setCommitError(sourceId, error instanceof Error ? error.message : String(error));
      }
    });
  }
}

/** Ask for a new generation now: the next observation seeds quietly. */
export async function restartSource(source: SourceDescriptor): Promise<void> {
  await queue.run(source.sourceId, async () => {
    await open(source, true);
  });
}

/** Wait until nothing runs or waits for the source (tests). */
export function ingestIdle(sourceId: string): Promise<void> {
  return queue.idle(sourceId);
}

/**
 * Retire the sources of one kind that settings no longer name. Their
 * entries stay; adding the source back with the same config continues
 * from its baseline.
 */
export async function retireSourcesExcept(
  kind: ActivitySourceKind,
  keep: readonly string[],
): Promise<void> {
  try {
    const sources = await api.listSources();
    for (const source of sources) {
      if (source.kind !== kind || source.retiredAt || keep.includes(source.sourceId)) continue;
      await api.retireSource(source.sourceId);
      states.delete(source.sourceId);
    }
  } catch (error) {
    log.warn('could not retire activity sources', { kind, error: String(error) });
  }
}

/**
 * The baseline the next observation of `source` is compared with, for
 * adapters that decide what to read (which PRs to verify, whose findings to
 * fetch) before they observe.
 */
export async function peekBaseline<B>(source: SourceDescriptor): Promise<B | null> {
  if (readOnly) return null;
  try {
    return ((await stateFor(source)).baseline as B | null) ?? null;
  } catch {
    return null;
  }
}
