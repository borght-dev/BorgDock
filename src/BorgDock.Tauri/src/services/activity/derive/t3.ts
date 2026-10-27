import { firstLine, sentence } from '../copy';
import { entityKey, entryId, normalizeTime } from '../sources';
import type {
  ActionTarget,
  ActivityEnrichment,
  ActivityEntity,
  ActivityResolution,
  ActivitySeenMark,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import {
  createdAfterSeed,
  emptyResult,
  fingerprint,
  keepMissing,
  later,
  makeEntry,
  resolveCategories,
  resolveIds,
} from './shared';

/** A question with more options than this is answered in the app, not in a row. */
const MAX_ANSWERABLE_OPTIONS = 4;

export interface T3Question {
  question: string;
  options: { label: string; value: string }[];
  recommended: number | null;
  multiSelect: boolean;
}

/** What the thread snapshot adds, when Dispatch has read it. */
export interface T3ThreadDetail {
  questionRequestId: string | null;
  questions: T3Question[];
  lastAgentMessage: string | null;
}

/** One thread as the shell reports it, with the facts the rules compare. */
export interface T3ThreadFacts {
  rawId: string;
  title: string;
  /** The T3 project the thread runs in: the slot name copy uses. */
  slot: string;
  createdAt: string;
  /** `run:thread:<id>:ordinal:<n>`. */
  runId: string | null;
  runCompletedAt: string | null;
  /** T3's raw run status: completed, failed, interrupted, cancelled, queued, running, waiting, idle. */
  runStatus: string | null;
  stopRequested: boolean;
  lastError: string | null;
  lastErrorClass: string | null;
  pendingRequest: { id: string; kind: string; createdAt: string | null } | null;
  hasPlan: boolean;
  limitRecovery: {
    requestId: string | null;
    runId: string;
    resetAt: string;
    autoResume: boolean;
  } | null;
  lastVisitedAt: string | null;
  subagent: boolean;
  itemIds: number[];
  prUrls: string[];
  detail: T3ThreadDetail | null;
}

export interface T3Observation {
  hostId: string;
  hostLabel: string;
  threads: T3ThreadFacts[];
  /** False when the shell answered only in part; missing threads then stay as they were. */
  complete: boolean;
  /** Settings: a visit in T3 marks the thread's entries read. */
  seenInT3: boolean;
}

export interface T3ThreadBaseline {
  runId: string | null;
  ordinal: number | null;
  runStatus: string | null;
  requestId: string | null;
  requestKind: string | null;
  planRunId: string | null;
  /** `<runId>:failed` or `<runId>:interrupted` once an entry was made for it. */
  errorKey: string | null;
  limitRequestId: string | null;
  limitOrdinal: number | null;
  lastVisitedAt: string | null;
  createdAt: string;
  /** The detail the open entries were last written with. */
  detailKey: string | null;
  missingSince?: string;
}

export interface T3Baseline {
  threads: Record<string, T3ThreadBaseline>;
}

const ORDINAL = /:ordinal:(\d+)$/;

/** The run's ordinal, or null when T3 changed the run id format. */
export function ordinalOf(runId: string | null): number | null {
  const match = runId ? ORDINAL.exec(runId) : null;
  return match ? Number(match[1]) : null;
}

const TERMINAL = new Set(['completed', 'failed', 'interrupted', 'cancelled']);
const WORKING = new Set(['preparing', 'queued', 'starting', 'running', 'waiting']);

function limitKeyOf(limit: NonNullable<T3ThreadFacts['limitRecovery']>): string {
  return limit.requestId ?? `${limit.runId}:${limit.resetAt}`;
}

function detailKeyOf(detail: T3ThreadDetail | null): string | null {
  if (!detail) return null;
  return fingerprint(
    [
      detail.questionRequestId ?? '',
      ...detail.questions.map((q) => `${q.question}|${q.options.map((o) => o.label).join('/')}`),
      firstLine(detail.lastAgentMessage),
    ].join('\n'),
  );
}

function blankBaseline(createdAt: string): T3ThreadBaseline {
  return {
    runId: null,
    ordinal: 0,
    runStatus: null,
    requestId: null,
    requestKind: null,
    planRunId: null,
    errorKey: null,
    limitRequestId: null,
    limitOrdinal: null,
    lastVisitedAt: null,
    createdAt,
    detailKey: null,
  };
}

/** What a thread is now, as the next observation compares it. */
/**
 * A run moved past its usage limit: it works again, or a later run started.
 * T3 keeps `limitRecovery` after that, so the limit alone says nothing.
 */
function limitResumed(thread: T3ThreadFacts, limitRunId: string | null): boolean {
  const working = thread.runStatus !== null && WORKING.has(thread.runStatus);
  const ordinal = ordinalOf(thread.runId);
  const limitOrdinal = ordinalOf(limitRunId);
  return working || (limitOrdinal !== null && ordinal !== null && ordinal > limitOrdinal);
}

function baselineOf(thread: T3ThreadFacts, previous: T3ThreadBaseline | null): T3ThreadBaseline {
  const planRunId = thread.hasPlan && thread.runStatus === 'completed' ? thread.runId : null;
  // Only a limit that still holds is remembered, so its resolution fires once.
  const limit =
    thread.limitRecovery && !limitResumed(thread, thread.limitRecovery.runId)
      ? thread.limitRecovery
      : null;
  const errorKey =
    thread.runStatus === 'failed' || thread.runStatus === 'interrupted'
      ? `${thread.runId}:${thread.runStatus}`
      : (previous?.errorKey ?? null);
  return {
    runId: thread.runId,
    ordinal: ordinalOf(thread.runId),
    runStatus: thread.runStatus,
    requestId: thread.pendingRequest?.id ?? null,
    requestKind: thread.pendingRequest?.kind ?? null,
    planRunId,
    errorKey,
    limitRequestId: limit ? limitKeyOf(limit) : null,
    limitOrdinal: limit ? ordinalOf(limit.runId) : null,
    lastVisitedAt: normalizeTime(thread.lastVisitedAt) ?? previous?.lastVisitedAt ?? null,
    createdAt: thread.createdAt,
    detailKey: detailKeyOf(thread.detail) ?? previous?.detailKey ?? null,
  };
}

interface Draft {
  entries: NewActivityEntry[];
  enrichments: ActivityEnrichment[];
  resolutions: ActivityResolution[];
  seen: ActivitySeenMark[];
}

function questionCopy(
  thread: T3ThreadFacts,
  requestId: string,
): { summary: string; detail: string | null; action: ActionTarget } {
  const detail = thread.detail?.questionRequestId === requestId ? thread.detail : null;
  const [question] = detail?.questions ?? [];
  const recommended =
    detail?.questions.length === 1 &&
    question &&
    !question.multiSelect &&
    question.recommended !== null &&
    question.options.length <= MAX_ANSWERABLE_OPTIONS
      ? question.options[question.recommended]
      : undefined;
  const lines = (detail?.questions ?? []).map((q) =>
    q.options.length > 0
      ? `${q.question}\n${q.options.map((o) => `• ${o.label}`).join('\n')}`
      : q.question,
  );
  return {
    summary: sentence.question(thread.slot, question?.question ?? null, thread.title),
    detail: lines.length > 0 ? lines.join('\n\n') : null,
    action: {
      kind: 'answer',
      hostId: '',
      threadId: thread.rawId,
      requestId,
      option: recommended?.label ?? null,
    },
  };
}

function messageOf(thread: T3ThreadFacts): string | null {
  return firstLine(thread.detail?.lastAgentMessage) || null;
}

function deriveThread(
  ctx: DeriveContext,
  observation: T3Observation,
  thread: T3ThreadFacts,
  base: T3ThreadBaseline,
  draft: Draft,
): void {
  const key = entityKey.thread(observation.hostId, thread.rawId);
  const entity: ActivityEntity = { kind: 'thread', key, title: thread.title, url: null };
  const links = { itemIds: thread.itemIds, prUrls: thread.prUrls };
  const threadKey = `thread:${thread.rawId}`;
  const open: ActionTarget = {
    kind: 'open-thread',
    hostId: observation.hostId,
    threadId: thread.rawId,
  };
  const withHost = (action: ActionTarget): ActionTarget =>
    'hostId' in action ? { ...action, hostId: observation.hostId } : action;
  const add = (facts: Omit<Parameters<typeof makeEntry>[1], 'entity' | 'links'>) =>
    draft.entries.push(makeEntry(ctx, { ...facts, entity, links }));
  const ordinal = ordinalOf(thread.runId);
  const runChanged = thread.runId !== base.runId;
  const statusChanged = runChanged || thread.runStatus !== base.runStatus;
  const working = thread.runStatus !== null && WORKING.has(thread.runStatus);

  // Requests: a question or an approval the thread waits on.
  const request = thread.pendingRequest;
  if (base.requestId && base.requestId !== request?.id) {
    const kind = base.requestKind === 'user_input' ? 'request' : 'approval';
    draft.resolutions.push(
      resolveIds(
        ctx,
        [`${threadKey}:${kind}:${base.requestId}`],
        base.requestKind === 'user_input' ? 'answered' : 'approved',
      ),
    );
  }
  if (request && request.id !== base.requestId) {
    if (request.kind === 'user_input') {
      const copy = questionCopy(thread, request.id);
      add({
        nativeKey: `${threadKey}:request:${request.id}`,
        category: 'agent.question',
        severity: 'warning',
        needsYou: true,
        sourceAt: request.createdAt ?? ctx.now,
        summary: copy.summary,
        detail: copy.detail,
        action: withHost(copy.action),
      });
    } else {
      add({
        nativeKey: `${threadKey}:approval:${request.id}`,
        category: 'agent.approval',
        severity: 'warning',
        needsYou: true,
        sourceAt: request.createdAt ?? ctx.now,
        summary: sentence.approval(thread.slot, thread.title),
        action: open,
      });
    }
  }

  // A plan waits for approval until the thread runs again.
  const planRunId = thread.hasPlan && thread.runStatus === 'completed' ? thread.runId : null;
  if (base.planRunId && base.planRunId !== planRunId) {
    draft.resolutions.push(
      resolveIds(
        ctx,
        [`${threadKey}:plan:${base.planRunId}`],
        working ? 'running again' : 'no longer waiting',
      ),
    );
  }
  if (planRunId && planRunId !== base.planRunId) {
    add({
      nativeKey: `${threadKey}:plan:${planRunId}`,
      category: 'agent.plan',
      severity: 'warning',
      needsYou: true,
      sourceAt: thread.runCompletedAt,
      summary: sentence.plan(thread.slot, thread.title),
      detail: messageOf(thread),
      action: {
        kind: 'approve-plan',
        hostId: observation.hostId,
        threadId: thread.rawId,
        runId: planRunId,
      },
    });
  }

  // Runs that finished while nobody looked: one entry for the gap.
  if (base.ordinal !== null && ordinal !== null && ordinal > base.ordinal) {
    const baseSettled = base.runStatus !== null && TERMINAL.has(base.runStatus);
    const from = baseSettled || base.runId === null ? base.ordinal + 1 : base.ordinal;
    const to = ordinal - 1;
    if (to >= from) {
      add({
        nativeKey: `${threadKey}:runs:${from}-${to}`,
        category: 'agent.turns-missed',
        severity: 'info',
        needsYou: false,
        sourceAt: null,
        summary: sentence.turnsMissed(thread.slot, to - from + 1, thread.title),
        action: open,
      });
    }
  }

  if (statusChanged && thread.runId) {
    if (thread.runStatus === 'completed' && !planRunId) {
      const nativeKey = `${threadKey}:run:${thread.runId}:completed`;
      draft.resolutions.push(
        resolveCategories(key, ['agent.turn'], entryId(ctx.sourceId, nativeKey), 'superseded'),
      );
      add({
        nativeKey,
        category: 'agent.turn',
        severity: 'success',
        needsYou: false,
        sourceAt: thread.runCompletedAt,
        summary: sentence.turn(thread.slot, thread.title),
        detail: messageOf(thread),
        action: open,
      });
    }
    if (thread.runStatus === 'completed') {
      draft.resolutions.push(
        resolveCategories(key, ['agent.failed', 'agent.interrupted'], 'a later run completed'),
      );
    }
    const errorKey = `${thread.runId}:${thread.runStatus}`;
    if (thread.runStatus === 'failed' && errorKey !== base.errorKey) {
      add({
        nativeKey: `${threadKey}:run:${thread.runId}:failed`,
        category: 'agent.failed',
        severity: 'error',
        needsYou: true,
        sourceAt: thread.runCompletedAt,
        summary: sentence.failed(thread.slot, thread.title),
        detail:
          [thread.lastErrorClass, firstLine(thread.lastError)].filter(Boolean).join(': ') ||
          messageOf(thread),
        action: open,
      });
    }
    // Only an interruption I did not ask for is news.
    if (thread.runStatus === 'interrupted' && !thread.stopRequested && errorKey !== base.errorKey) {
      add({
        nativeKey: `${threadKey}:run:${thread.runId}:interrupted`,
        category: 'agent.interrupted',
        severity: 'warning',
        needsYou: true,
        sourceAt: thread.runCompletedAt,
        summary: sentence.interrupted(thread.slot, thread.title),
        detail: firstLine(thread.lastError) || messageOf(thread),
        action: open,
      });
    }
  }

  // Usage limits. T3 keeps `limitRecovery` after the run resumes, so the
  // run moving past the limited one is what resolves it.
  const limit = thread.limitRecovery;
  const resumedSince = (limitOrdinal: number | null) =>
    working || (limitOrdinal !== null && ordinal !== null && ordinal > limitOrdinal);
  if (base.limitRequestId && resumedSince(base.limitOrdinal)) {
    draft.resolutions.push(resolveIds(ctx, [`limit:${base.limitRequestId}`], 'resumed'));
  }
  if (limit && limitKeyOf(limit) !== base.limitRequestId && !limitResumed(thread, limit.runId)) {
    add({
      nativeKey: `limit:${limitKeyOf(limit)}`,
      category: 'agent.limited',
      severity: 'warning',
      needsYou: !limit.autoResume,
      sourceAt: null,
      summary: sentence.limited(thread.slot, limit.resetAt, limit.autoResume, thread.title),
      action: open,
    });
  }

  // A detail read after the entry exists fills it in.
  const detailKey = detailKeyOf(thread.detail);
  if (detailKey && detailKey !== base.detailKey) {
    const created = new Set(draft.entries.map((entry) => entry.id));
    const enrich = (nativeKey: string, patch: Omit<ActivityEnrichment, 'id'>) => {
      const id = entryId(ctx.sourceId, nativeKey);
      if (!created.has(id)) draft.enrichments.push({ id, ...patch });
    };
    if (request?.kind === 'user_input' && thread.detail?.questionRequestId === request.id) {
      const copy = questionCopy(thread, request.id);
      enrich(`${threadKey}:request:${request.id}`, {
        summary: copy.summary,
        detail: copy.detail,
        action: withHost(copy.action),
      });
    }
    const message = messageOf(thread);
    if (message && planRunId) enrich(`${threadKey}:plan:${planRunId}`, { detail: message });
    if (message && thread.runId && thread.runStatus === 'completed' && !planRunId) {
      enrich(`${threadKey}:run:${thread.runId}:completed`, { detail: message });
    }
  }

  // Seen in T3: a visit marks what happened up to it read, including
  // entries this observation adds.
  const visited = normalizeTime(thread.lastVisitedAt);
  const addedHere = draft.entries.some((entry) => entry.entity.key === key);
  if (observation.seenInT3 && visited && (later(visited, base.lastVisitedAt) || addedHere)) {
    draft.seen.push({ entityKey: key, before: visited, reason: 'seen-in-t3' });
  }
}

/**
 * The transitions from the baseline to the shell a host just reported.
 * Subagents create nothing: their root thread is the one that waits.
 */
export function deriveT3(
  ctx: DeriveContext,
  baseline: T3Baseline | null,
  observation: T3Observation,
): DeriveResult<T3Baseline> {
  const previous = baseline?.threads ?? {};
  const threads: Record<string, T3ThreadBaseline> = {};
  const draft: Draft = { entries: [], enrichments: [], resolutions: [], seen: [] };
  for (const thread of observation.threads) {
    if (thread.subagent) continue;
    const before = previous[thread.rawId] ?? null;
    threads[thread.rawId] = baselineOf(thread, before);
    if (ctx.seed) continue;
    const base =
      before && !before.missingSince
        ? before
        : before
          ? { ...before, missingSince: undefined }
          : createdAfterSeed(ctx, thread.createdAt)
            ? blankBaseline(thread.createdAt)
            : null;
    if (!base) continue;
    deriveThread(ctx, observation, thread, base, draft);
  }
  const present = new Set(Object.keys(threads));
  const result = emptyResult<T3Baseline>({
    threads: { ...keepMissing(ctx, previous, present, observation.complete), ...threads },
  });
  if (ctx.seed) return result;
  return { ...result, ...draft };
}
