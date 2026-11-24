import { sentence } from '../copy';
import { entityKey, entryId, normalizeTime } from '../sources';
import type {
  ActivityCategory,
  ActivityResolution,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import { emptyResult, keepMissing, later, makeEntry, resolveCategories } from './shared';

export interface AdoCommentFacts {
  id: number;
  /** The account that posted it. */
  author: string;
  /** `Vera · plan` when an agent signed it, else null. */
  signedBy: string | null;
  /** Posted from my account and not signed. */
  byMe: boolean;
  at: string;
  text: string;
}

export interface AdoItemFacts {
  id: number;
  title: string;
  url: string;
  rev: number;
  state: string;
  /** The item type's workflow, in process order. */
  states: string[];
  assignedToMe: boolean;
  changedBy: string | null;
  /** `System.ChangedBy` is me. */
  changedByMe: boolean;
  changedAt: string;
  newestComment: AdoCommentFacts | null;
}

export interface AdoObservation {
  organization: string;
  project: string;
  /** The items Dispatch lists: mine, plus the Up next items of others. */
  items: AdoItemFacts[];
}

export interface AdoItemBaseline {
  rev: number;
  state: string;
  assignedToMe: boolean;
  newestCommentId: number | null;
  missingSince?: string;
}

export interface AdoBaseline {
  items: Record<string, AdoItemBaseline>;
}

/** What an item can leave needing me; none of it does once the item left my list. */
const ENDS_WITH_THE_ITEM: ActivityCategory[] = ['ado.assigned', 'ado.state', 'ado.comment'];

function baselineOf(item: AdoItemFacts): AdoItemBaseline {
  return {
    rev: item.rev,
    state: item.state,
    assignedToMe: item.assignedToMe,
    newestCommentId: item.newestComment?.id ?? null,
  };
}

/**
 * Changes someone else made to the items Dispatch lists. My own changes
 * create nothing; comments from my account count only when an agent signed
 * them. An assignment is a quiet entry: Dispatch lists the item. Of several
 * state changes or comments on one item the newest is the open one, and an
 * item that leaves the query, or is no longer mine, ends what it left open.
 */
export function deriveAdo(
  ctx: DeriveContext,
  baseline: AdoBaseline | null,
  observation: AdoObservation,
): DeriveResult<AdoBaseline> {
  const previous = baseline?.items ?? {};
  const items: Record<string, AdoItemBaseline> = {};
  const entries: NewActivityEntry[] = [];
  const resolutions: ActivityResolution[] = [];
  const { organization, project } = observation;

  for (const item of observation.items) {
    const id = String(item.id);
    items[id] = baselineOf(item);
    if (ctx.seed) continue;
    const before = previous[id];
    const back = before?.missingSince !== undefined;
    const key = entityKey.workItem(organization, project, item.id);
    const entity = { kind: 'workitem' as const, key, title: item.title, url: item.url };
    const links = { itemIds: [item.id] };
    const add = (facts: Omit<Parameters<typeof makeEntry>[1], 'entity' | 'links'>) =>
      entries.push(makeEntry(ctx, { ...facts, entity, links }));
    const action = { kind: 'open-item' as const, itemId: item.id };
    const changedBy = item.changedByMe ? null : item.changedBy;

    const wasMine = before && !back ? before.assignedToMe : false;
    // A first sighting is news only when the change that brought it here came after the seed.
    const recent = before !== undefined || later(item.changedAt, ctx.seededAt);
    if (item.assignedToMe && !wasMine && !item.changedByMe && recent) {
      add({
        nativeKey: `item:${item.id}:rev:${item.rev}:assigned`,
        category: 'ado.assigned',
        severity: 'info',
        needsYou: false,
        sourceAt: item.changedAt,
        summary: sentence.assigned(item.id, item.title, changedBy),
        action,
      });
    }

    // An Up next item of someone else is listed, but its changes are theirs.
    if (!item.assignedToMe) {
      if (wasMine) resolutions.push(resolveCategories(key, ENDS_WITH_THE_ITEM, 'no longer yours'));
      continue;
    }

    const moved = before && item.rev !== before.rev && item.state !== before.state;
    if (moved && item.changedByMe) {
      resolutions.push(resolveCategories(key, ['ado.state'], 'you moved it'));
    }
    if (moved && !item.changedByMe) {
      const from = item.states.indexOf(before.state);
      const to = item.states.indexOf(item.state);
      const backwards = from !== -1 && to !== -1 && to < from;
      const nativeKey = `item:${item.id}:rev:${item.rev}:state`;
      resolutions.push(
        resolveCategories(key, ['ado.state'], entryId(ctx.sourceId, nativeKey), 'superseded'),
      );
      add({
        nativeKey,
        category: 'ado.state',
        severity: backwards ? 'warning' : 'info',
        needsYou: backwards,
        sourceAt: item.changedAt,
        summary: sentence.stateMoved(item.id, item.title, before.state, item.state, changedBy),
        action,
      });
    }

    const comment = item.newestComment;
    if (before && comment && comment.id !== before.newestCommentId) {
      if (comment.signedBy) {
        add({
          nativeKey: `ado-comment:${comment.id}`,
          category: 'agent.report',
          severity: 'info',
          needsYou: false,
          sourceAt: normalizeTime(comment.at),
          summary: sentence.report(comment.signedBy, item.id, item.title),
          detail: comment.text,
          action,
        });
      } else if (!comment.byMe) {
        const nativeKey = `ado-comment:${comment.id}`;
        resolutions.push(
          resolveCategories(key, ['ado.comment'], entryId(ctx.sourceId, nativeKey), 'superseded'),
        );
        add({
          nativeKey,
          category: 'ado.comment',
          severity: 'info',
          needsYou: true,
          sourceAt: normalizeTime(comment.at),
          summary: sentence.comment(comment.author, item.id, item.title),
          detail: comment.text,
          action,
        });
      } else {
        resolutions.push(resolveCategories(key, ['ado.comment'], 'replied'));
      }
    }
  }

  const present = new Set(Object.keys(items));
  const result = emptyResult<AdoBaseline>({
    items: { ...keepMissing(ctx, previous, present, true), ...items },
  });
  if (ctx.seed) return result;
  for (const [id, before] of Object.entries(previous)) {
    if (present.has(id) || before.missingSince) continue;
    resolutions.push(
      resolveCategories(
        entityKey.workItem(organization, project, Number(id)),
        ENDS_WITH_THE_ITEM,
        'no longer on your list',
      ),
    );
  }
  return { ...result, entries, resolutions };
}
