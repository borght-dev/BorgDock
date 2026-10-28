import type {
  ActivityCounts,
  ActivityEntryRow_Serialize,
  ActivityListQuery_Deserialize,
  ActivityMarkRequest_Deserialize,
  ActivityReadState_Deserialize,
  ActivitySourceState_Serialize,
} from '@/generated/commands';
import { FIXTURE_ENTRIES } from '@/services/activity/__fixtures__/entries';
import type { ActivityEntry } from '@/services/activity/types';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { makeThread } from '@/services/dispatch/__tests__/fixtures';
import { useActivityStore } from '@/stores/activity-store';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { getControl } from '../../../../.storybook/mocks/control';

/**
 * The activity journal's commands for stories and screenshots, answered
 * from memory with the same filters Rust applies.
 */

export const FIXTURE_SOURCES: ActivitySourceState_Serialize[] = [
  ['t3:local', 't3', 'This laptop'],
  ['t3:mini', 't3', 'Mac mini'],
  ['gh:github.com|koen|acme/app', 'gh', 'acme/app (koen)'],
  ['deploy:github.com|koen|acme/app', 'deploy', 'Deployments of acme/app (koen)'],
  ['ci:github.com|koen|acme/app', 'ci', 'CI failures in acme/app'],
  ['workstreams:local', 'workstreams', 'Workstreams'],
  ['ado:org/proj', 'ado', 'org/proj'],
].map(([sourceId, kind, label]) => ({
  sourceId: sourceId!,
  kind: kind!,
  label: label!,
  configKey: sourceId!,
  generation: 1,
  revision: 1,
  baseline: null,
  seededAt: '2026-10-20T08:00:00.000Z',
  committedAt: '2026-10-27T15:00:00.000Z',
  retiredAt: null,
}));

function toRow(entry: ActivityEntry): ActivityEntryRow_Serialize {
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
    payload: JSON.stringify({
      schema: 1,
      entity: entry.entity,
      action: entry.action,
      links: entry.links,
    }),
    read: entry.read,
    readReason: entry.readReason,
    readAt: entry.readAt,
    version: entry.version,
  };
}

export interface ActivityScene {
  entries?: ActivityEntry[];
  /** Leave `activity_list` unanswered: the loading state. */
  pending?: boolean;
  commitError?: string;
  readOnly?: boolean;
  full?: boolean;
}

export function seedActivity({
  entries = FIXTURE_ENTRIES,
  pending = false,
  commitError,
  readOnly = false,
  full = false,
}: ActivityScene = {}) {
  const rows = entries.map(toRow);
  let revision = 1;
  const counts = (): ActivityCounts => {
    const result: ActivityCounts = {
      unread: 0,
      needsYou: 0,
      byCategory: {},
      bySource: {},
      revision,
    };
    for (const row of rows) {
      if (row.read !== 'unread') continue;
      const needs = row.needsYou && row.status === 'open' ? 1 : 0;
      result.unread++;
      result.needsYou += needs;
      for (const [map, key] of [
        [result.byCategory, row.category],
        [result.bySource, row.sourceId],
      ] as const) {
        const count = map[key] ?? { unread: 0, needsYou: 0 };
        map[key] = { unread: count.unread + 1, needsYou: count.needsYou + needs };
      }
    }
    return result;
  };
  const list = (args: unknown) => {
    const query = (args as { query: ActivityListQuery_Deserialize }).query;
    const matched = rows
      .filter((row) =>
        query.filter === 'needs-you'
          ? row.read === 'unread' && row.needsYou && row.status === 'open'
          : query.filter === 'unread'
            ? row.read === 'unread'
            : row.read !== 'dismissed',
      )
      .filter((row) => query.categories.length === 0 || query.categories.includes(row.category))
      .filter((row) => query.sourceIds.length === 0 || query.sourceIds.includes(row.sourceId))
      .filter(
        (row) =>
          !query.search ||
          `${row.summary} ${row.detail ?? ''}`.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.id.localeCompare(a.id));
    return { entries: matched.slice(0, query.limit), total: matched.length, revision };
  };
  const mark = (args: unknown) => {
    const request = (args as { request: ActivityMarkRequest_Deserialize }).request;
    const previous: ActivityReadState_Deserialize[] = [];
    for (const row of rows) {
      if (!request.ids.includes(row.id) || row.read === request.read) continue;
      previous.push({
        id: row.id,
        read: row.read,
        readReason: row.readReason,
        readAt: row.readAt,
        version: row.version,
      });
      row.read = request.read;
      row.readReason = request.read === 'unread' ? null : (request.reason ?? 'user');
      row.version++;
    }
    revision++;
    useActivityStore.getState().setCounts(counts());
    return { previous, changed: previous.length, revision };
  };
  const restore = (args: unknown) => {
    for (const state of (args as { states: ActivityReadState_Deserialize[] }).states) {
      const row = rows.find((candidate) => candidate.id === state.id);
      if (row)
        Object.assign(row, {
          read: state.read,
          readReason: state.readReason,
          readAt: state.readAt,
        });
    }
    revision++;
    useActivityStore.getState().setCounts(counts());
    return revision;
  };
  const responses = getControl().invokeResponses;
  responses.activity_list = pending ? () => new Promise(() => {}) : list;
  responses.activity_counts = () => counts();
  responses.activity_sources = FIXTURE_SOURCES;
  responses.activity_mark = mark;
  responses.activity_restore = restore;
  responses.activity_store_info = {
    path: 'activity.db',
    readOnly,
    recoveredFrom: null,
    schemaVersion: 1,
    entries: rows.length,
    unread: counts().unread,
    needsYou: counts().needsYou,
    capacity: full ? 'full' : 'ok',
    unreadCapacity: 5000,
  };
  // The threads and the group the entries name, so their actions can run.
  useDispatchStore.setState({
    hosts: [
      {
        id: 'local',
        label: 'This laptop',
        ok: true,
        at: '2026-10-27T15:29:00.000Z',
        error: null,
        environmentId: 'env-local',
      },
      {
        id: 'mini',
        label: 'Mac mini',
        ok: true,
        at: '2026-10-27T15:29:00.000Z',
        error: null,
        environmentId: 'env-mini',
      },
    ],
    threads: [
      makeThread({
        id: 'a',
        place: 'W3',
        title: 'Fix login',
        status: 'question',
        questionRequestId: 'req-1',
        questions: [
          {
            id: 'q1',
            question: 'Keep the old session cookie for one release, or drop it now?',
            options: [
              { label: 'Keep it for one release', value: 'keep' },
              { label: 'Drop it now', value: 'drop' },
            ],
            recommended: 0,
            allowCustomAnswer: true,
            multiSelect: false,
          },
        ],
      }),
      makeThread({
        id: 'mini:b',
        hostId: 'mini',
        hostLabel: 'Mac mini',
        place: 'M2',
        status: 'plan',
        run: {
          id: 'run:thread:b:ordinal:4',
          completedAt: null,
          status: 'completed',
          stopRequested: false,
          lastError: null,
          lastErrorClass: null,
          pendingRequest: null,
          hasPlan: true,
          limitRecovery: null,
          lastVisitedAt: null,
        },
      }),
      makeThread({ id: 'c', place: 'W1' }),
      makeThread({ id: 'd', place: 'W2', status: 'failed' }),
    ],
  });
  useCiFailuresStore.setState({
    loaded: true,
    groups: [
      {
        id: 'g1',
        scope: 'github.com||acme/app',
        title: 'Login spec times out',
        prNumbers: [412, 415, 420],
      } as CiGroupSummary,
    ],
  });
  useActivityStore.setState({
    counts: counts(),
    commitErrors: commitError ? { 't3:local': commitError } : {},
    readOnly,
    capacity: full ? 'full' : 'ok',
    recoveredFrom: null,
  });
}
