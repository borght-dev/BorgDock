import {
  type ActivityCommit_Deserialize,
  type ActivityEntryInput_Deserialize,
  type ActivityEntryRow_Serialize,
  type ActivityListQuery_Deserialize,
  type ActivityMarkRequest_Deserialize,
  type ActivityOutboxAck,
  type ActivityReadState_Deserialize,
  type ActivitySourceRequest,
  commands,
} from '@/generated/commands';
import { commandData } from '@/services/native-command';
import type {
  ActionTarget,
  ActivityCategory,
  ActivityEntity,
  ActivityEntry,
  ActivityLinks,
  NewActivityEntry,
} from './types';

/**
 * The activity journal's commands, unwrapped. The journal lives in Rust
 * (`activity.db`); every window reads it, and only the main window's
 * runtime commits observations.
 */

interface Payload {
  schema: 1;
  entity: ActivityEntity | null;
  action: ActionTarget | null;
  links: ActivityLinks;
  /** Set on the roll-up the store writes when old updates fold. */
  rolledUp?: number;
}

export function toInput(entry: NewActivityEntry): ActivityEntryInput_Deserialize {
  const payload: Payload = {
    schema: 1,
    entity: entry.entity,
    action: entry.action,
    links: entry.links,
  };
  return {
    id: entry.id,
    sourceId: entry.sourceId,
    entityKey: entry.entity.key,
    category: entry.category,
    severity: entry.severity,
    needsYou: entry.needsYou,
    status: entry.status,
    resolvedBy: entry.resolvedBy,
    sourceAt: entry.sourceAt,
    observedAt: entry.observedAt,
    coverage: entry.coverage,
    summary: entry.summary,
    detail: entry.detail,
    payload: JSON.stringify(payload),
  };
}

export function payloadOf(
  entity: ActivityEntity,
  action: ActionTarget | null,
  links: ActivityLinks,
) {
  return JSON.stringify({ schema: 1, entity, action, links } satisfies Payload);
}

function parsePayload(text: string): Partial<Payload> {
  try {
    return JSON.parse(text) as Partial<Payload>;
  } catch {
    return {};
  }
}

const NO_LINKS: ActivityLinks = { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] };

export function toEntry(row: ActivityEntryRow_Serialize): ActivityEntry {
  const payload = parsePayload(row.payload);
  return {
    id: row.id,
    schema: 1,
    sourceId: row.sourceId,
    entity: payload.entity ?? {
      kind: 'source',
      key: row.entityKey,
      title: row.sourceId,
      url: null,
    },
    category: row.category as ActivityCategory,
    severity: row.severity as ActivityEntry['severity'],
    needsYou: row.needsYou,
    status: row.status as ActivityEntry['status'],
    resolvedBy: row.resolvedBy,
    sourceAt: row.sourceAt,
    observedAt: row.observedAt,
    coverage: row.coverage as ActivityEntry['coverage'],
    summary: row.summary,
    detail: row.detail,
    action: payload.action ?? null,
    links: { ...NO_LINKS, ...payload.links },
    read: row.read as ActivityEntry['read'],
    readReason: row.readReason as ActivityEntry['readReason'],
    readAt: row.readAt,
    version: row.version,
  };
}

export const openSource = (source: ActivitySourceRequest) =>
  commandData(commands.activityOpenSource(source));
export const listSources = () => commandData(commands.activitySources());
export const retireSource = (sourceId: string) =>
  commandData(commands.activityRetireSource(sourceId));
export const commit = (request: ActivityCommit_Deserialize) =>
  commandData(commands.activityCommit(request));
export const listEntries = async (query: ActivityListQuery_Deserialize) => {
  const page = await commandData(commands.activityList(query));
  return { ...page, entries: page.entries.map(toEntry) };
};
export const counts = () => commandData(commands.activityCounts());
export const mark = (request: ActivityMarkRequest_Deserialize) =>
  commandData(commands.activityMark(request));
export const restore = (states: ActivityReadState_Deserialize[]) =>
  commandData(commands.activityRestore(states));
export const outboxTake = async (channel: 'popup' | 'push' | 'push-clear', limit: number) => {
  const items = await commandData(commands.activityOutboxTake(channel, limit));
  return items.map((item) => ({ ...item, entry: toEntry(item.entry) }));
};
export const outboxAck = (acks: ActivityOutboxAck[]) =>
  commandData(commands.activityOutboxAck(acks));
export const clear = (sourceId: string | null) => commandData(commands.activityClear(sourceId));
export const exportTo = (path: string) => commandData(commands.activityExport(path));
export const prune = () => commandData(commands.activityPrune());
export const storeInfo = () => commandData(commands.activityStoreInfo());
