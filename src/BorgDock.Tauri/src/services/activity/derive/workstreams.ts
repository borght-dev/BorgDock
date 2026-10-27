import { sentence } from '../copy';
import { entityKey } from '../sources';
import type {
  ActivityCategory,
  ActivityResolution,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import { createdAfterSeed, emptyResult, makeEntry, resolveIds } from './shared';

export interface WorkstreamAttentionFacts {
  /** Stable while its cause holds, e.g. `unblocked:<relationId>` or `ready`. */
  id: string;
  tone: 'bad' | 'warn' | 'ok';
  reason: string;
}

export interface WorkstreamFacts {
  id: string;
  title: string;
  createdAt: string;
  attention: WorkstreamAttentionFacts[];
}

export interface WorkstreamsObservation {
  documents: WorkstreamFacts[];
  /**
   * A host just came back: attention moved because data came back, not
   * because work did. What holds is recorded without entries or resolutions.
   */
  quiet?: boolean;
}

export interface WorkstreamsBaseline {
  /** Per document, the attention ids that held at the last observation and their episode. */
  holding: Record<string, Record<string, number>>;
  /** Per document, the last episode each attention id reached; it never goes back. */
  episodes: Record<string, Record<string, number>>;
}

const KINDS: Record<string, { category: ActivityCategory; heading: string; resolvedBy: string }> = {
  unblocked: {
    category: 'workstream.unblocked',
    heading: 'Unblocked',
    resolvedBy: 'no longer holds',
  },
  invalidated: {
    category: 'workstream.invalidated',
    heading: 'No longer holds',
    resolvedBy: 'holds again',
  },
  reopened: {
    category: 'workstream.reopened',
    heading: 'Completed workstream changed',
    resolvedBy: 'settled',
  },
  conflict: {
    category: 'workstream.conflict',
    heading: 'Changed on another machine',
    resolvedBy: 'merged',
  },
  proposal: {
    category: 'workstream.proposal',
    heading: 'Agent proposals',
    resolvedBy: 'accepted or rejected',
  },
  ready: { category: 'workstream.ready', heading: 'Ready to complete', resolvedBy: 'completed' },
};

function kindOf(attentionId: string) {
  return KINDS[attentionId.split(':')[0] ?? ''] ?? null;
}

function nativeKey(documentId: string, attentionId: string, episode: number): string {
  return `${documentId}:${attentionId}#${episode}`;
}

/**
 * Attention ids repeat when a state comes back (`ready`, `conflict`), so
 * each time one starts holding again it is a new episode and a new entry.
 * One that stops holding resolves its open entry.
 */
export function deriveWorkstreams(
  ctx: DeriveContext,
  baseline: WorkstreamsBaseline | null,
  observation: WorkstreamsObservation,
): DeriveResult<WorkstreamsBaseline> {
  const holding: WorkstreamsBaseline['holding'] = {};
  const episodes: WorkstreamsBaseline['episodes'] = { ...(baseline?.episodes ?? {}) };
  const entries: NewActivityEntry[] = [];
  const resolutions: ActivityResolution[] = [];

  for (const document of observation.documents) {
    const before = baseline?.holding[document.id];
    const counting =
      !ctx.seed &&
      !observation.quiet &&
      (before !== undefined || createdAfterSeed(ctx, document.createdAt));
    const now: Record<string, number> = {};
    const reached = { ...(episodes[document.id] ?? {}) };
    for (const attention of document.attention) {
      const kind = kindOf(attention.id);
      if (!kind) continue;
      const held = before?.[attention.id];
      if (held !== undefined) {
        now[attention.id] = held;
        continue;
      }
      const episode = (reached[attention.id] ?? 0) + 1;
      reached[attention.id] = episode;
      now[attention.id] = episode;
      if (!counting) continue;
      entries.push(
        makeEntry(ctx, {
          nativeKey: nativeKey(document.id, attention.id, episode),
          entity: {
            kind: 'workstream',
            key: entityKey.workstream(document.id),
            title: document.title,
            url: null,
          },
          links: { workstreamIds: [document.id] },
          category: kind.category,
          severity:
            attention.tone === 'bad' ? 'warning' : attention.tone === 'ok' ? 'success' : 'info',
          needsYou: kind.category !== 'workstream.ready',
          sourceAt: null,
          summary: sentence.workstream(kind.heading, document.title, attention.reason),
          action: { kind: 'open-workstream', id: document.id },
        }),
      );
    }
    for (const [attentionId, episode] of Object.entries(before ?? {})) {
      if (now[attentionId] !== undefined) continue;
      const kind = kindOf(attentionId);
      if (!ctx.seed && !observation.quiet && kind) {
        resolutions.push(
          resolveIds(ctx, [nativeKey(document.id, attentionId, episode)], kind.resolvedBy),
        );
      }
    }
    holding[document.id] = now;
    episodes[document.id] = reached;
  }
  // A document that vanished (trashed, not synced yet) keeps what held: only
  // a positive observation resolves.
  for (const [documentId, held] of Object.entries(baseline?.holding ?? {})) {
    if (!holding[documentId] && !observation.documents.some((d) => d.id === documentId)) {
      holding[documentId] = held;
    }
  }
  const result = emptyResult<WorkstreamsBaseline>({ holding, episodes });
  if (ctx.seed) return result;
  return { ...result, entries, resolutions };
}
