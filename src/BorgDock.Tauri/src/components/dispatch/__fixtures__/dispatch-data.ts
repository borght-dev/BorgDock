// A day of work in Dispatch, for stories and tests: sixteen items across every
// bay, nine local slots and five on a second host. The overview is built by
// the real engine, so the scene cannot drift from what the app would show.

import { buildOverview } from '@/services/dispatch/engine';
import type {
  AgentProject,
  AgentQuestion,
  AgentThread,
  DispatchItem,
  ItemComment,
  ItemNote,
  KnownPullRequest,
  Overview,
  ThreadStatus,
  WorkflowState,
} from '@/services/dispatch/types';
import type { T3Catalogue } from '@/services/t3/api';
import type { AgentRun, HostStatus, SourceStatus } from '@/stores/dispatch-store';

const WORKFLOW: WorkflowState[] = [
  { name: 'New', category: 'Proposed' },
  { name: 'Approved', category: 'Proposed' },
  { name: 'Development In Progress', category: 'InProgress' },
  { name: 'Testing Failed', category: 'InProgress' },
  { name: 'Needs Human', category: 'InProgress' },
  { name: 'Code Review', category: 'Resolved' },
  { name: 'Ready For QA', category: 'Resolved' },
  { name: 'Done', category: 'Completed' },
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface ItemSpec {
  id: number;
  typeName: string;
  title: string;
  state: string;
  priority?: number;
  sprint?: string;
  dueInDays?: number;
  /** The newest block of Developer Notes, written `daysAgo`. */
  notes?: { text: string; daysAgo: number };
  comment?: { author: string; text: string; hoursAgo: number; byMe?: boolean };
  linkedPullRequests?: number[];
}

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function toNote(spec: ItemSpec, now: number): ItemNote | null {
  if (!spec.notes) return null;
  const date = isoDate(now - spec.notes.daysAgo * DAY);
  return { text: spec.notes.text, date };
}

function toComment(spec: ItemSpec, now: number): ItemComment | null {
  if (!spec.comment) return null;
  const { author, text, hoursAgo, byMe = false } = spec.comment;
  return { author, text, at: new Date(now - hoursAgo * HOUR).toISOString(), byMe };
}

const ITEM_SPECS: ItemSpec[] = [
  {
    id: 60214,
    typeName: 'Bug',
    title: 'Order list loses its scroll position after refresh',
    state: 'Development In Progress',
    priority: 1,
  },
  {
    id: 59877,
    typeName: 'Product Backlog Item',
    title: 'Show technician availability on the planning board',
    state: 'Development In Progress',
  },
  {
    id: 60102,
    typeName: 'Bug',
    title: 'CSV export drops the last column',
    state: 'Development In Progress',
  },
  {
    id: 59640,
    typeName: 'Quality Improvement',
    title: 'Flaky login test on the mobile client',
    state: 'Development In Progress',
    priority: 3,
  },
  {
    id: 59403,
    typeName: 'Product Backlog Item',
    title: 'Asset history on the detail page',
    state: 'Code Review',
    sprint: 'Sprint 41',
    notes: {
      text: 'Asset history merged into main: PR #3668 is in. QA should check an asset with more than 200 events.',
      daysAgo: 0,
    },
  },
  {
    id: 59958,
    typeName: 'Bug',
    title: 'Recurring jobs use the wrong timezone offset',
    state: 'Development In Progress',
    sprint: 'Sprint 41',
  },
  {
    id: 60031,
    typeName: 'Product Backlog Item',
    title: 'Bulk-assign jobs from the map view',
    state: 'Development In Progress',
  },
  {
    id: 60150,
    typeName: 'Task',
    title: 'Upgrade the report renderer',
    state: 'Development In Progress',
    priority: 3,
  },
  {
    id: 60188,
    typeName: 'Bug',
    title: 'Signature pad is blank on small tablets',
    state: 'Approved',
  },
  {
    id: 60090,
    typeName: 'Product Backlog Item',
    title: 'Offline queue for photo uploads',
    state: 'Approved',
  },
  {
    id: 60201,
    typeName: 'Bug',
    title: 'Search ignores accents in customer names',
    state: 'New',
    priority: 1,
    dueInDays: 2,
  },
  { id: 60177, typeName: 'Task', title: 'Remove the legacy sync flag', state: 'New', priority: 3 },
  {
    id: 60120,
    typeName: 'Product Backlog Item',
    title: 'Per-customer SLA colours on the board',
    state: 'Approved',
    priority: 3,
    sprint: 'Backlog',
  },
  {
    id: 60066,
    typeName: 'Quality Improvement',
    title: 'Trim the nightly build cache',
    state: 'New',
    priority: 4,
    sprint: 'Backlog',
  },
  {
    id: 59712,
    typeName: 'Product Backlog Item',
    title: 'Barcode scan on the mobile client',
    state: 'Development In Progress',
    priority: 3,
    sprint: 'Sprint 41',
  },
  {
    id: 59544,
    typeName: 'Bug',
    title: 'Duplicate notifications after reconnect',
    state: 'Ready For QA',
    sprint: 'Sprint 41',
  },
  {
    id: 60240,
    typeName: 'Quality Improvement',
    title: 'Decide which of the legacy report services stay',
    state: 'Needs Human',
    comment: {
      author: 'Vera · plan',
      text: 'I need your decision on two classes: ReplanService, which every order move calls, and TravelTimeService. The other ten are decided and the plan is attached.',
      hoursAgo: 3 * 24 + 2,
    },
  },
  {
    id: 60233,
    typeName: 'Bug',
    title: 'Route planner skips the first stop after a reorder',
    state: 'Testing Failed',
    comment: {
      author: 'Mira Jansen',
      text: 'Retested on staging: the first stop is still skipped when the route has a break in it.',
      hoursAgo: 5,
    },
  },
  {
    id: 60245,
    typeName: 'Product Backlog Item',
    title: 'Customer portal: download invoices as PDF',
    state: 'Code Review',
    notes: {
      text: 'PDF download built and reviewed: PR #3731 is approved and green. QA should try an invoice with more than one page.',
      daysAgo: 0,
    },
  },
  {
    id: 60248,
    typeName: 'Bug',
    title: 'Duplicate push notifications on Android 15',
    state: 'Code Review',
    comment: {
      author: 'Vera · proof',
      text: 'One notification per event on a Pixel 9 with Android 15, recorded from the PR build.',
      hoursAgo: 20,
    },
  },
];

function toItem(spec: ItemSpec, now: number): DispatchItem {
  return {
    id: spec.id,
    typeName: spec.typeName,
    title: spec.title,
    state: spec.state,
    stateCategory: WORKFLOW.find((s) => s.name === spec.state)?.category ?? 'Proposed',
    states: WORKFLOW,
    sprint: spec.sprint ?? 'Sprint 42',
    iterationPath: ['Shop', 'Release 5', spec.sprint ?? 'Sprint 42'].join('\\'),
    notes: toNote(spec, now),
    lastComment: toComment(spec, now),
    dueDate:
      spec.dueInDays === undefined ? null : new Date(now + spec.dueInDays * DAY).toISOString(),
    priority: spec.priority ?? 2,
    tags: [],
    assignedTo: 'Ada Lovelace',
    assignedToMe: true,
    url: `https://dev.azure.com/acme/Shop/_workitems/edit/${spec.id}`,
    linkedPullRequests: (spec.linkedPullRequests ?? []).map((number) => ({
      repositoryId: 'fsp-horizon',
      number,
    })),
    parentId: null,
    changedAt: new Date(now - DAY).toISOString(),
  };
}

const LOCAL = { hostId: 'local', hostLabel: 'This machine' };
const MAC = { hostId: 'mac', hostLabel: 'Mac' };

function projects(): AgentProject[] {
  const local = Array.from({ length: 9 }, (_, i) => ({ ...LOCAL, name: `W${i}` }));
  const mac = Array.from({ length: 5 }, (_, i) => ({ ...MAC, name: `M${i}` }));
  return [...local, ...mac].map((slot) => ({
    id: `p-${slot.name.toLowerCase()}`,
    hostId: slot.hostId,
    hostLabel: slot.hostLabel,
    available: true,
    title: slot.name,
    workspaceRoot: `/work/shop/${slot.name}`,
  }));
}

const SCROLL_QUESTION: AgentQuestion = {
  id: 'restore',
  question:
    'The grid virtualizes rows. I can restore the position by row id or by pixel offset. Which one?',
  options: [
    { label: 'Restore by row id', value: 'Restore by row id (Recommended)' },
    { label: 'Restore by pixel offset', value: 'Restore by pixel offset' },
  ],
  recommended: 0,
  allowCustomAnswer: true,
  multiSelect: false,
};

const PLAN_MESSAGE = `Plan, three steps.

- Add an availability endpoint that merges shifts and absences.
- Draw a lane per technician with busy blocks.
- Cover it with two end-to-end tests on the board.

No schema change. About 14 files.`;

interface ThreadSpec {
  id: string;
  slot: string;
  title: string;
  status: ThreadStatus;
  /** Minutes since the agent last did something. */
  idleMinutes: number;
  model?: string;
  branch?: string;
  message?: string;
  question?: AgentQuestion;
}

const THREAD_SPECS: ThreadSpec[] = [
  {
    id: 't-60214',
    slot: 'W3',
    title: 'AB#60214 Order list loses its scroll position',
    status: 'question',
    idleMinutes: 4,
    branch: 'fix/60214-order-list-scroll',
    question: SCROLL_QUESTION,
  },
  {
    id: 't-59877',
    slot: 'W1',
    title: 'AB#59877 Technician availability',
    status: 'plan',
    idleMinutes: 18,
    model: 'opus',
    branch: 'feat/59877-technician-availability',
    message: PLAN_MESSAGE,
  },
  {
    id: 't-60102',
    slot: 'W5',
    title: 'AB#60102 CSV export drops the last column',
    status: 'your-turn',
    idleMinutes: 31,
    branch: 'fix/60102-csv-last-column',
    message:
      'Done. The writer skipped the final delimiter when the last cell was empty. PR 3712 is open and all 24 checks pass.',
  },
  {
    id: 't-59640',
    slot: 'W7',
    title: 'AB#59640 Flaky login test',
    status: 'failed',
    idleMinutes: 62,
    branch: 'fix/59640-flaky-login-test',
    message:
      'Stopped with an error. `bun install` failed with EPERM on the lockfile. Nothing was committed.',
  },
  {
    id: 't-60031',
    slot: 'W2',
    title: 'AB#60031 Bulk-assign jobs from the map view',
    status: 'running',
    idleMinutes: 1,
    model: 'opus',
    branch: 'feat/60031-bulk-assign-map',
  },
  {
    id: 't-60150',
    slot: 'M4',
    title: 'AB#60150 Upgrade the report renderer',
    status: 'running',
    idleMinutes: 2,
    branch: 'chore/60150-report-renderer',
  },
  {
    id: 't-59403',
    slot: 'W4',
    title: 'AB#59403 Asset history on the detail page',
    status: 'settled',
    idleMinutes: 2 * 24 * 60,
    branch: 'feat/59403-asset-history',
  },
  {
    id: 't-59958',
    slot: 'W6',
    title: 'AB#59958 Recurring jobs timezone',
    status: 'settled',
    idleMinutes: 9 * 24 * 60,
    branch: 'fix/59958-timezone-offset',
  },
  {
    id: 't-59712',
    slot: 'W8',
    title: 'AB#59712 Barcode scan on the mobile client',
    status: 'settled',
    idleMinutes: 3 * 24 * 60,
  },
  {
    id: 't-other-1',
    slot: 'W0',
    title: 'Spike: map tile caching',
    status: 'running',
    idleMinutes: 6,
  },
  {
    id: 't-other-2',
    slot: 'M0',
    title: 'Docs: release checklist',
    status: 'your-turn',
    idleMinutes: 90,
  },
  {
    id: 't-other-3',
    slot: 'M3',
    title: 'AB#58810 Tenant export',
    status: 'running',
    idleMinutes: 3,
  },
];

function toThread(spec: ThreadSpec, now: number): AgentThread {
  const host = spec.slot.startsWith('M') ? MAC : LOCAL;
  const lastActivityAt = new Date(now - spec.idleMinutes * MINUTE).toISOString();
  return {
    id: spec.id,
    ...host,
    available: true,
    projectId: `p-${spec.slot.toLowerCase()}`,
    slot: spec.slot,
    title: spec.title,
    branch: spec.branch ?? null,
    createdAt: new Date(now - spec.idleMinutes * MINUTE - 40 * MINUTE).toISOString(),
    lastActivityAt,
    open: spec.status !== 'settled',
    status: spec.status,
    interactionMode: 'default',
    model: spec.model ?? 'codex',
    modelInstance: spec.model ? 'claudeAgent' : 'codex',
    effort: 'high',
    pullRequests: [],
    firstUserMessage: '',
    questionRequestId: spec.question ? 'req-1' : null,
    questions: spec.question ? [spec.question] : [],
    lastAgentMessage: spec.message ?? null,
  };
}

const PULL_REQUESTS: KnownPullRequest[] = [
  {
    number: 3712,
    url: 'https://github.com/acme/shop/pull/3712',
    state: 'open',
    title: 'fix: CSV export keeps the last column (AB#60102)',
    isDraft: false,
    branch: 'fix/60102-csv-last-column',
    workItemIds: [60102],
    checks: { passed: 24, failed: 0, pending: 0, total: 24 },
    approved: false,
    mergedAt: null,
  },
  {
    number: 3668,
    url: 'https://github.com/acme/shop/pull/3668',
    state: 'merged',
    title: 'feat: asset history on the detail page (AB#59403)',
    isDraft: false,
    branch: 'feat/59403-asset-history',
    workItemIds: [59403],
    checks: { passed: 24, failed: 0, pending: 0, total: 24 },
    approved: false,
    mergedAt: null,
  },
  {
    number: 3720,
    url: 'https://github.com/acme/shop/pull/3720',
    state: 'open',
    title: 'feat: bulk-assign jobs from the map (AB#60031)',
    isDraft: true,
    branch: 'feat/60031-bulk-assign-map',
    workItemIds: [60031],
    checks: { passed: 7, failed: 0, pending: 5, total: 12 },
    approved: false,
    mergedAt: null,
  },
  {
    number: 3655,
    url: 'https://github.com/acme/shop/pull/3655',
    state: 'merged',
    title: 'fix: one notification per reconnect (AB#59544)',
    isDraft: false,
    branch: 'fix/59544-duplicate-notifications',
    workItemIds: [59544],
    checks: { passed: 24, failed: 0, pending: 0, total: 24 },
    approved: false,
    mergedAt: null,
  },
];

PULL_REQUESTS.push(
  {
    number: 3731,
    url: 'https://github.com/acme/shop/pull/3731',
    state: 'open',
    title: 'feat: invoices as PDF in the customer portal (AB#60245)',
    isDraft: false,
    branch: 'feat/60245-invoice-pdf',
    workItemIds: [60245],
    checks: { passed: 24, failed: 0, pending: 0, total: 24 },
    approved: true,
    mergedAt: null,
  },
  {
    number: 3733,
    url: 'https://github.com/acme/shop/pull/3733',
    state: 'open',
    title: 'fix: one push per event on Android 15 (AB#60248)',
    isDraft: false,
    branch: 'fix/60248-android-push',
    workItemIds: [60248],
    checks: { passed: 21, failed: 3, pending: 0, total: 24 },
    approved: false,
    mergedAt: null,
  },
);

const QUEUED = new Set([60188, 60090]);

/** What `t3_catalogue` answers in stories and tests: two providers, one with reasoning levels. */
export const LAUNCH_CATALOGUE: T3Catalogue = {
  environmentId: 'env-local',
  providers: [
    {
      instanceId: 'codex',
      driver: 'codex',
      displayName: 'Codex',
      models: [
        {
          slug: 'default',
          name: 'Default',
          isDefault: true,
          options: [
            {
              id: 'reasoningEffort',
              label: 'Reasoning',
              kind: 'select',
              choices: [
                { id: 'low', label: 'Low', isDefault: false },
                { id: 'medium', label: 'Medium', isDefault: true },
                { id: 'high', label: 'High', isDefault: false },
              ],
            },
          ],
        },
      ],
    },
    {
      instanceId: 'claudeAgent',
      driver: 'claudeAgent',
      displayName: 'Claude',
      models: [
        { slug: 'opus', name: 'Opus', isDefault: true, options: [] },
        { slug: 'sonnet', name: 'Sonnet', isDefault: false, options: [] },
      ],
    },
  ],
};

export interface DispatchScene {
  items: DispatchItem[];
  threads: AgentThread[];
  projects: AgentProject[];
  overview: Overview;
  ado: SourceStatus;
  hosts: HostStatus[];
}

/** The whole scene as the store holds it, with times relative to `now`. */
export function makeDispatchScene(now: number = Date.now()): DispatchScene {
  const items = ITEM_SPECS.map((spec) => toItem(spec, now));
  const threads = THREAD_SPECS.map((spec) => toThread(spec, now));
  const slots = projects();
  const { overview } = buildOverview({
    items,
    threads,
    projects: slots,
    pullRequests: PULL_REQUESTS,
    queued: QUEUED,
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    slotPattern: null,
    now: new Date(now),
  });
  const at = new Date(now - 2 * MINUTE).toISOString();
  return {
    items,
    threads,
    projects: slots,
    overview,
    ado: { ok: true, at, error: null },
    hosts: [
      {
        id: 'local',
        label: 'This machine',
        ok: true,
        at: new Date(now).toISOString(),
        error: null,
      },
      { id: 'mac', label: 'Mac', ok: true, at: new Date(now).toISOString(), error: null },
    ],
  };
}

/** Two runs for stories: a Sync all that finished, and a suggestion still at work. */
export function makeRunScene(now: number = Date.now()): {
  threads: AgentThread[];
  runs: AgentRun[];
} {
  const threads = [
    toThread(
      {
        id: 't-sync',
        slot: 'W0',
        title: 'Dispatch: Sync all (8)',
        status: 'your-turn',
        idleMinutes: 3,
        model: 'opus',
        message: [
          '- **AB#59403** notes updated with the merge of #3668 and the QA hint; moved Code Review → Ready For QA.',
          '- **AB#60245** kept in Code Review: #3731 is approved but not merged.',
          '- **AB#60248** kept in Code Review: #3733 fails 3 checks.',
          '- **AB#59958** kept: no pull request and no work yet.',
        ].join('\n'),
      },
      now,
    ),
    toThread(
      {
        id: 't-suggest',
        slot: 'M0',
        title: 'Dispatch: Suggest my next item',
        status: 'running',
        idleMinutes: 0,
        model: 'opus',
      },
      now,
    ),
  ];
  const runs: AgentRun[] = [
    {
      threadId: 't-suggest',
      kind: 'suggest',
      states: [],
      itemIds: [],
      slot: 'M0',
      startedAt: new Date(now - 2 * MINUTE).toISOString(),
    },
    {
      threadId: 't-sync',
      kind: 'sync',
      states: ['Code Review', 'Development In Progress'],
      itemIds: [59403, 60245, 60248, 59958],
      slot: 'W0',
      startedAt: new Date(now - 20 * MINUTE).toISOString(),
    },
  ];
  return { threads, runs };
}
