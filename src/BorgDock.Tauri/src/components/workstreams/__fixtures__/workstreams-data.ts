import { makeDispatchScene } from '@/components/dispatch/__fixtures__/dispatch-data';
import { recomputeWorkstreams } from '@/runtime/workstreams-sync';
import {
  addMembers,
  addOutcome,
  addRelation,
  confirmOutcome,
  type EditContext,
  type EditResult,
  openDecision,
  setGoal,
  setNextAction,
  setPinned,
  setStatus,
} from '@/services/workstreams/edits';
import { decisionKey, outcomeKey, refKey } from '@/services/workstreams/identity';
import { newDocument } from '@/services/workstreams/schema';
import { memoryStorage } from '@/services/workstreams/storage';
import type { SourceRef, WorkstreamDocument } from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { type Entry, setWorkstreamStorage, useWorkstreamsStore } from '@/stores/workstreams-store';
import type { PullRequestWithChecks } from '@/types';

/** Every name here is invented: BorgDock is public. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEVICE = { deviceId: 'device-laptop', deviceLabel: 'Laptop' };

function ok(result: EditResult): WorkstreamDocument {
  if ('error' in result) throw new Error(result.error);
  return result.document;
}

function pr(
  number: number,
  title: string,
  overrides: Partial<PullRequestWithChecks['pullRequest']> = {},
  status: 'green' | 'red' | 'yellow' = 'green',
): PullRequestWithChecks {
  const now = Date.now();
  return {
    pullRequest: {
      number,
      title,
      headRef: `feature/${number}`,
      baseRef: 'main',
      authorLogin: 'ada',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(now - 4 * DAY).toISOString(),
      updatedAt: new Date(now - 3 * HOUR).toISOString(),
      isDraft: false,
      htmlUrl: `https://github.com/acme/shop/pull/${number}`,
      body: '',
      repoOwner: 'acme',
      repoName: 'shop',
      reviewStatus: 'none',
      commentCount: 2,
      labels: [],
      additions: 120,
      deletions: 30,
      changedFiles: 6,
      commitCount: 4,
      requestedReviewers: [],
      ...overrides,
    },
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['build', 'e2e'] : [],
    failedCheckSuiteIds: status === 'red' ? [1] : [],
    pendingCheckNames: status === 'yellow' ? ['build'] : [],
    passedCount: status === 'green' ? 24 : 18,
    skippedCount: 0,
    totalCheckCount: 24,
  };
}

const item = (id: number): SourceRef => ({
  kind: 'ado-item',
  organization: 'acme',
  project: 'Shop',
  id,
});
const shopPr = (number: number): SourceRef => ({
  kind: 'github-pr',
  owner: 'acme',
  repo: 'shop',
  number,
});
const thread = (threadId: string, mac = false): SourceRef => ({
  kind: 't3-thread',
  environmentId: mac ? 'env-mac' : 'env-laptop',
  threadId,
  hostId: mac ? 'mac' : 'local',
});

function context(daysAgo: number): EditContext {
  return {
    now: new Date(Date.now() - daysAgo * DAY).toISOString(),
    device: daysAgo > 2 ? 'Mac mini' : 'Laptop',
  };
}

function planningBoard(): WorkstreamDocument {
  let d = { ...newDocument('Dispatchers plan from one board', context(9).now, DEVICE) };
  d = ok(
    setGoal(
      d,
      'Dispatchers see who is free and **assign several jobs at once** without leaving the planning board.\n\n- availability on the board\n- bulk assignment\n- the old assign dialog gone',
      context(9),
    ),
  );
  d = ok(
    addMembers(
      d,
      [
        {
          ref: item(59877),
          label: 'Show technician availability on the planning board',
          role: 'primary',
        },
        { ref: item(60031), label: 'Bulk-assign jobs from the map view', role: 'primary' },
        { ref: thread('t-59877'), label: 'AB#59877 Technician availability', role: 'supporting' },
        {
          ref: thread('t-60031'),
          label: 'AB#60031 Bulk-assign jobs from the map view',
          role: 'supporting',
        },
        {
          ref: shopPr(3720),
          label: 'feat: bulk-assign jobs from the map (AB#60031)',
          role: 'supporting',
        },
        { ref: shopPr(3741), label: 'feat: bulk-assign from the job list', role: 'supporting' },
        {
          ref: {
            kind: 'link',
            url: 'https://docs.example.com/planning-board',
            title: 'Planning board spec',
          },
          label: 'Planning board spec',
          role: 'context',
        },
      ],
      context(8),
    ),
  );
  const decision = openDecision(
    d,
    'Bulk-assign from the map or from the job list?',
    [refKey(shopPr(3720)), refKey(shopPr(3741))],
    context(5),
  );
  d = ok(decision);
  const availability = addOutcome(
    d,
    'Dispatchers see availability on the board',
    true,
    [{ kind: 'item-category', target: refKey(item(59877)), value: 'Resolved' }],
    context(7),
  );
  d = ok(availability);
  const bulk = addOutcome(
    d,
    'Bulk assignment is merged',
    true,
    [{ kind: 'pr-merged', target: refKey(shopPr(3720)), value: 'main' }],
    context(7),
  );
  d = ok(bulk);
  const removed = addOutcome(d, 'The old assign dialog is gone', true, [], context(6));
  d = ok(removed);
  d = ok(addOutcome(d, 'Assignment works offline', false, [], context(6)));
  d = ok(
    addRelation(
      d,
      'blocks',
      decisionKey(decision.decisionId!),
      outcomeKey(bulk.outcomeId!),
      'Merge the approach we keep',
      context(5),
    ),
  );
  d = ok(
    addRelation(
      d,
      'blocks',
      refKey(item(59877)),
      outcomeKey(removed.outcomeId!),
      'The dialog stays until the board shows availability',
      context(5),
    ),
  );
  d = ok(
    setNextAction(
      d,
      'Approve the availability plan in W1',
      refKey(thread('t-59877')),
      'you',
      context(1),
    ),
  );
  return ok(
    setPinned(
      { ...d, updatedAt: new Date(Date.now() - 40 * 60_000).toISOString(), writtenBy: DEVICE },
      true,
    ),
  );
}

function assetHistory(): WorkstreamDocument {
  let d = { ...newDocument('Asset history ships', context(20).now, DEVICE) };
  d = ok(
    setGoal(d, 'Service desks see the full history of an asset on its detail page.', context(20)),
  );
  d = ok(
    addMembers(
      d,
      [
        { ref: item(59403), label: 'Asset history on the detail page', role: 'primary' },
        {
          ref: shopPr(3668),
          label: 'feat: asset history on the detail page (AB#59403)',
          role: 'primary',
        },
        {
          ref: thread('t-59403'),
          label: 'AB#59403 Asset history on the detail page',
          role: 'context',
        },
      ],
      context(19),
    ),
  );
  const merged = addOutcome(
    d,
    'History is merged into main',
    true,
    [{ kind: 'pr-merged', target: refKey(shopPr(3668)) }],
    context(18),
  );
  d = ok(merged);
  const qa = addOutcome(d, 'QA checked an asset with 200+ events', true, [], context(18));
  d = ok(qa);
  d = ok(
    confirmOutcome(
      d,
      qa.outcomeId!,
      [refKey(item(59403))],
      'Checked asset A-1188 (412 events) on staging, scrolls fine.',
      context(1),
    ),
  );
  d = ok(setNextAction(d, 'Complete the workstream', null, 'suggestion', context(1)));
  return {
    ...d,
    updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    writtenBy: { deviceId: 'mini', deviceLabel: 'Mac mini' },
  };
}

function csvExport(): WorkstreamDocument {
  let d = { ...newDocument('Exports keep every column', context(6).now, DEVICE) };
  d = ok(setGoal(d, 'CSV and Excel exports carry every column the screen shows.', context(6)));
  d = ok(
    addMembers(
      d,
      [
        { ref: item(60102), label: 'CSV export drops the last column', role: 'primary' },
        {
          ref: thread('t-60102'),
          label: 'AB#60102 CSV export drops the last column',
          role: 'supporting',
        },
        {
          ref: shopPr(3712),
          label: 'fix: CSV export keeps the last column (AB#60102)',
          role: 'primary',
        },
      ],
      context(5),
    ),
  );
  d = ok(
    addOutcome(
      d,
      'The fix is merged',
      true,
      [{ kind: 'item-delivered', target: refKey(item(60102)) }],
      context(5),
    ),
  );
  d = ok(setNextAction(d, 'Review #3712', refKey(shopPr(3712)), 'you', context(4)));
  d = ok(setStatus(d, 'paused', context(3)));
  return { ...d, updatedAt: new Date(Date.now() - 2 * DAY).toISOString(), writtenBy: DEVICE };
}

function legacyReports(): WorkstreamDocument {
  let d = { ...newDocument('Retire the legacy report server', context(40).now, DEVICE) };
  d = ok(addMembers(d, [{ ref: item(60150), label: 'Upgrade the report renderer' }], context(40)));
  d = ok(setStatus(d, 'archived', context(30)));
  return { ...d, updatedAt: new Date(Date.now() - 30 * DAY).toISOString(), writtenBy: DEVICE };
}

/** What can't be read: a host that is offline, a repository without access, a deleted item. */
function offlineCase(): WorkstreamDocument {
  let d = { ...newDocument('Mobile photo uploads survive bad signal', context(12).now, DEVICE) };
  d = ok(
    addMembers(
      d,
      [
        { ref: item(60090), label: 'Offline queue for photo uploads', role: 'primary' },
        {
          ref: thread('t-60150', true),
          label: 'AB#60150 Upgrade the report renderer',
          role: 'supporting',
        },
        {
          ref: { kind: 'github-pr', owner: 'acme', repo: 'mobile-legacy', number: 88 },
          label: 'Retry uploads on reconnect',
          role: 'supporting',
        },
        { ref: item(61999), label: 'Photo compression on device', role: 'supporting' },
      ],
      context(11),
    ),
  );
  d = ok(
    addOutcome(
      d,
      'Uploads retry after reconnect',
      true,
      [
        {
          kind: 'pr-merged',
          target: refKey({ kind: 'github-pr', owner: 'acme', repo: 'mobile-legacy', number: 88 }),
        },
      ],
      context(11),
    ),
  );
  d = ok(setNextAction(d, 'Check the retry PR on the mobile repository', null, 'you', context(10)));
  return { ...d, updatedAt: new Date(Date.now() - 5 * HOUR).toISOString(), writtenBy: DEVICE };
}

export interface WorkstreamScene {
  offline?: boolean;
  conflict?: boolean;
  empty?: boolean;
  readOnly?: boolean;
}

function entry(document: WorkstreamDocument, extra: Partial<Entry> = {}): Entry {
  return {
    document,
    base: document,
    readOnly: false,
    dirty: false,
    saving: false,
    saveError: null,
    conflict: null,
    ...extra,
  };
}

/** Seed Dispatch, the PR poll and the workstreams for a story, then build the assessments. */
export function seedWorkstreams(scene: WorkstreamScene = {}): { ids: string[] } {
  const now = Date.now();
  const dispatch = makeDispatchScene(now);
  useSettingsStore.setState((s) => ({
    hasLoaded: true,
    settings: {
      ...s.settings,
      setupComplete: true,
      repos: [
        { owner: 'acme', name: 'shop', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
      ],
      azureDevOps: {
        ...s.settings.azureDevOps,
        organization: 'acme',
        project: 'Shop',
        personalAccessToken: 'storybook-token',
      },
      agents: {
        ...s.settings.agents!,
        t3Hosts: [{ id: 'mac', label: 'Mac', baseUrl: 'http://mac.example:3773' }],
      },
    },
  }));
  useDispatchStore.setState({
    items: dispatch.items,
    threads: dispatch.threads,
    projects: dispatch.projects,
    overview: dispatch.overview,
    ado: dispatch.ado,
    missingItemIds: [61999],
    hosts: dispatch.hosts.map((h) => ({
      ...h,
      environmentId: h.id === 'local' ? 'env-laptop' : 'env-mac',
      ...(scene.offline && h.id === 'mac' ? { ok: false, error: 'timed out' } : {}),
    })),
  });
  usePrStore.setState({
    pullRequests: [
      pr(3712, 'fix: CSV export keeps the last column (AB#60102)'),
      pr(3720, 'feat: bulk-assign jobs from the map (AB#60031)', { isDraft: true }, 'yellow'),
      pr(3741, 'feat: bulk-assign from the job list', {}, 'red'),
    ],
    closedPullRequests: [
      pr(3668, 'feat: asset history on the detail page (AB#59403)', {
        state: 'closed',
        mergedAt: new Date(now - 2 * DAY).toISOString(),
        baseRef: 'main',
      }),
    ],
    lastPollTime: new Date(now - 20_000),
  });
  const documents = scene.empty
    ? []
    : [
        planningBoard(),
        assetHistory(),
        csvExport(),
        legacyReports(),
        ...(scene.offline ? [offlineCase()] : []),
      ];
  // The folder holds what the store holds, so the stories write like the app does.
  setWorkstreamStorage(
    memoryStorage(Object.fromEntries(documents.map((d) => [`${d.id}.json`, JSON.stringify(d)]))),
  );
  const entries: Record<string, Entry> = {};
  for (const document of documents) {
    entries[document.id] = entry(document, {
      readOnly: scene.readOnly && document === documents[0],
    });
  }
  if (scene.conflict && documents[0]) {
    const mine = documents[0];
    const theirs = {
      ...mine,
      title: 'Dispatchers plan everything from the board',
      writtenBy: { deviceId: 'mini', deviceLabel: 'Mac mini' },
    };
    entries[mine.id] = entry(mine, {
      dirty: true,
      conflict: {
        theirs,
        merged: mine,
        theirsDevice: 'Mac mini',
        copyFileName: null,
        conflicts: [
          { path: 'title', field: 'title', label: 'Title', mine: mine.title, theirs: theirs.title },
          {
            path: 'nextAction',
            field: 'nextAction',
            label: 'Next action',
            mine: mine.nextAction,
            theirs: { ...mine.nextAction, text: 'Ask QA to try bulk-assign on staging' },
          },
        ],
      },
    });
  }
  useWorkstreamsStore.setState({
    loaded: true,
    loadError: null,
    entries,
    filter: 'active',
    search: '',
    unreadable: [],
    trashed: [],
  });
  useWorkstreamSourcesStore.setState({
    lookedUp: new Map(
      scene.offline
        ? [
            [
              'acme/mobile-legacy#88',
              {
                status: 'no-access',
                checkedAt: now,
                error: "acme/mobile-legacy can't be read with this GitHub account.",
              },
            ],
          ]
        : [],
    ),
  });
  recomputeWorkstreams();
  // Once more: the first pass writes down what the rules verified.
  recomputeWorkstreams();
  return { ids: documents.map((d) => d.id) };
}
