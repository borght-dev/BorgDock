import type { ItemHistoryEvent } from '../../../shared/src/api.ts';
import { pullRequestLinkOf } from './client.ts';

type FieldChange = { oldValue?: unknown; newValue?: unknown };
type Relation = { rel: string; url: string };

/** One entry of ADO's `/_apis/wit/workItems/{id}/updates`. */
export type RawUpdate = {
  rev: number;
  revisedBy?: { displayName?: string };
  revisedDate?: string;
  fields?: Record<string, FieldChange>;
  relations?: { added?: Relation[]; removed?: Relation[] };
};

const nameOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value.replace(/\s*<[^>]*>$/, '') || null;
  const name = (value as { displayName?: unknown } | null | undefined)?.displayName;
  return typeof name === 'string' && name ? name : null;
};

const textOf = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * How the item got here, newest first: created, state moves, assignments and GitHub pull requests linked. The
 * current revision's `revisedDate` is ADO's far future, so each change is dated by its ChangedDate.
 */
export function historyOf(updates: readonly RawUpdate[]): ItemHistoryEvent[] {
  const events: (ItemHistoryEvent & { rev: number; order: number })[] = [];
  for (const update of updates) {
    const fields = update.fields ?? {};
    const at = textOf(fields['System.ChangedDate']?.newValue) ?? textOf(fields['System.CreatedDate']?.newValue) ?? update.revisedDate ?? '';
    const by = nameOf(fields['System.ChangedBy']?.newValue) ?? nameOf(update.revisedBy) ?? 'Unknown';
    const push = (event: ItemHistoryEvent) => events.push({ ...event, rev: update.rev, order: events.length });
    if (update.rev === 1) {
      push({ at, by, kind: 'created', from: null, to: textOf(fields['System.State']?.newValue) });
    } else {
      const state = fields['System.State'];
      if (state && state.newValue !== state.oldValue) push({ at, by, kind: 'state', from: textOf(state.oldValue), to: textOf(state.newValue) });
      const assigned = fields['System.AssignedTo'];
      if (assigned && nameOf(assigned.newValue) !== nameOf(assigned.oldValue)) push({ at, by, kind: 'assigned', from: nameOf(assigned.oldValue), to: nameOf(assigned.newValue) });
    }
    for (const relation of update.relations?.added ?? []) {
      const link = relation.rel === 'ArtifactLink' ? pullRequestLinkOf(relation.url) : null;
      if (link) push({ at, by, kind: 'pullRequest', from: null, to: null, pullRequest: link.number });
    }
  }
  return events
    .sort((a, b) => b.at.localeCompare(a.at) || b.rev - a.rev || b.order - a.order)
    .map(({ rev: _rev, order: _order, ...event }) => event);
}
