import { expect, type Page, test } from '@playwright/test';
import type { MockHandlers } from './helpers/mock-tauri';
import { getInvokeLog } from './helpers/mock-tauri';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Activity against an in-browser journal kept in sessionStorage. The
 * handlers run in the page (they are serialized), so they read and write
 * the journal there, with the same filters Rust applies.
 */

interface Row {
  id: string;
  sourceId: string;
  entityKey: string;
  category: string;
  severity: string;
  needsYou: boolean;
  status: string;
  resolvedBy: string | null;
  sourceAt: string | null;
  observedAt: string;
  coverage: string;
  summary: string;
  detail: string | null;
  payload: string;
  read: string;
  readReason: string | null;
  readAt: string | null;
  version: number;
}

function row(id: string, summary: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    sourceId: 't3:local',
    entityKey: `t3:local:thread:${id}`,
    category: 'agent.turn',
    severity: 'success',
    needsYou: false,
    status: 'open',
    resolvedBy: null,
    sourceAt: '2026-01-01T09:00:00.000Z',
    observedAt: '2026-01-01T09:00:00.000Z',
    coverage: 'live',
    summary,
    detail: null,
    payload: JSON.stringify({
      schema: 1,
      entity: { kind: 'thread', key: `t3:local:thread:${id}`, title: summary, url: null },
      action: { kind: 'open-thread', hostId: 'local', threadId: id },
      links: { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] },
    }),
    read: 'unread',
    readReason: null,
    readAt: null,
    version: 1,
    ...overrides,
  };
}

function journalHandlers(): MockHandlers {
  return {
    // The local T3 answers, unchanged, so its threads stay as seeded and it counts as online.
    t3_snapshot: { changed: false, sequence: 1, projects: [], threads: [] },
    activity_list: (args: Record<string, unknown>) => {
      const query = args.query as { filter: string; limit: number };
      const rows = JSON.parse(sessionStorage.getItem('e2e-activity') ?? '[]') as Row[];
      const matched = rows
        .filter((r) =>
          query.filter === 'needs-you'
            ? r.read === 'unread' && r.needsYou && r.status === 'open'
            : query.filter === 'unread'
              ? r.read === 'unread'
              : r.read !== 'dismissed',
        )
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.id.localeCompare(a.id));
      return { entries: matched.slice(0, query.limit), total: matched.length, revision: 1 };
    },
    activity_counts: () => {
      const rows = JSON.parse(sessionStorage.getItem('e2e-activity') ?? '[]') as Row[];
      const unread = rows.filter((r) => r.read === 'unread');
      return {
        unread: unread.length,
        needsYou: unread.filter((r) => r.needsYou && r.status === 'open').length,
        byCategory: {},
        bySource: {},
        revision: 1,
      };
    },
    activity_sources: () => [],
    activity_store_info: () => ({
      path: 'activity.db',
      readOnly: false,
      recoveredFrom: null,
      schemaVersion: 1,
      entries: 0,
      unread: 0,
      needsYou: 0,
      capacity: 'ok',
      unreadCapacity: 5000,
    }),
    activity_mark: (args: Record<string, unknown>) => {
      const request = args.request as { ids: string[]; read: string; reason: string | null };
      const rows = JSON.parse(sessionStorage.getItem('e2e-activity') ?? '[]') as Row[];
      // A commit lands while the mark is on its way: it must stay unread.
      if (sessionStorage.getItem('e2e-arrive') === '1') {
        sessionStorage.removeItem('e2e-arrive');
        const arrived = JSON.parse(sessionStorage.getItem('e2e-arriving') ?? 'null') as Row | null;
        if (arrived) rows.push(arrived);
      }
      const previous: unknown[] = [];
      for (const r of rows) {
        if (!request.ids.includes(r.id) || r.read === request.read) continue;
        previous.push({ id: r.id, read: r.read, readReason: r.readReason, readAt: r.readAt, version: r.version });
        r.read = request.read;
        r.readReason = request.read === 'unread' ? null : (request.reason ?? 'user');
        r.readAt = request.read === 'unread' ? null : '2026-01-01T10:00:00.000Z';
        r.version += 1;
      }
      sessionStorage.setItem('e2e-activity', JSON.stringify(rows));
      return { previous, changed: previous.length, revision: 2 };
    },
    activity_restore: (args: Record<string, unknown>) => {
      const states = args.states as { id: string; read: string; readReason: string | null; readAt: string | null }[];
      const rows = JSON.parse(sessionStorage.getItem('e2e-activity') ?? '[]') as Row[];
      for (const state of states) {
        const r = rows.find((candidate) => candidate.id === state.id);
        if (r) Object.assign(r, { read: state.read, readReason: state.readReason, readAt: state.readAt });
      }
      sessionStorage.setItem('e2e-activity', JSON.stringify(rows));
      return 3;
    },
  };
}

async function boot(page: Page, rows: Row[], arriving?: Row) {
  await page.addInitScript(
    ({ rows, arriving }) => {
      if (sessionStorage.getItem('e2e-activity') === null) {
        sessionStorage.setItem('e2e-activity', JSON.stringify(rows));
      }
      if (arriving) sessionStorage.setItem('e2e-arriving', JSON.stringify(arriving));
    },
    { rows, arriving: arriving ?? null },
  );
  await bootApp(page, '', 'happy-path', journalHandlers());
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /Activity/ }).click();
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
}

const activityRows = (page: Page) => page.locator('.bd-act-row[data-activity-id]');

test('marking what is shown read leaves an entry that arrives meanwhile unread', async ({ page }) => {
  const shown = [
    row('a', 'W1 finished its turn on Rename the board'),
    row('b', 'W2 finished its turn on Split the export', { observedAt: '2026-01-01T08:00:00.000Z' }),
  ];
  const arriving = row('c', 'W3 finished its turn on Fix login', {
    observedAt: '2026-01-01T09:30:00.000Z',
    sourceAt: '2026-01-01T09:30:00.000Z',
  });
  await boot(page, shown, arriving);
  await expect(activityRows(page)).toHaveCount(2);

  await page.evaluate(() => sessionStorage.setItem('e2e-arrive', '1'));
  await page.getByRole('button', { name: 'Mark shown read' }).click();

  await expect(activityRows(page)).toHaveCount(1);
  await expect(activityRows(page).first()).toHaveAttribute('data-activity-id', 'c');
  const marks = (await getInvokeLog(page)).filter((call) => call.cmd === 'activity_mark');
  expect((marks[marks.length - 1]?.args as { request: { ids: string[] } }).request.ids.sort()).toEqual(['a', 'b']);
});

test('undo puts back exactly the states a mark replaced', async ({ page }) => {
  const rows = [
    row('a', 'W1 finished its turn on Rename the board'),
    row('b', 'W2 finished its turn on Split the export', {
      read: 'read',
      readReason: 'seen-in-t3',
      readAt: '2026-01-01T09:05:00.000Z',
      observedAt: '2026-01-01T08:00:00.000Z',
    }),
  ];
  await boot(page, rows);
  await page.getByRole('group', { name: 'Show entries' }).getByRole('button', { name: 'All' }).click();
  await expect(activityRows(page)).toHaveCount(2);

  await activityRows(page).first().click();
  await page.keyboard.press('#');
  await expect(activityRows(page)).toHaveCount(1);
  await page.keyboard.press('z');
  await expect(activityRows(page)).toHaveCount(2);

  const restored = (await getInvokeLog(page)).filter((call) => call.cmd === 'activity_restore');
  expect((restored[restored.length - 1]?.args as { states: unknown[] }).states).toEqual([
    { id: 'a', read: 'unread', readReason: null, readAt: null, version: 1 },
  ]);
  const journal = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-activity') ?? '[]'));
  expect(journal.find((r: Row) => r.id === 'b')).toMatchObject({ read: 'read', readReason: 'seen-in-t3' });
});

test('an answer the thread no longer asks falls back to Open', async ({ page }) => {
  const question = row('q', 'W3 asks: Keep the old cookie?', {
    category: 'agent.question',
    severity: 'warning',
    needsYou: true,
    payload: JSON.stringify({
      schema: 1,
      entity: { kind: 'thread', key: 't3:local:thread:q', title: 'Fix login', url: null },
      action: { kind: 'answer', hostId: 'local', threadId: 'q', requestId: 'req-1', option: 'Keep it' },
      links: { itemIds: [], prUrls: [], workstreamIds: [], ciGroupIds: [] },
    }),
  });
  await boot(page, [question]);
  await seedMainWindow(page, {
    threads: [
      {
        id: 'q',
        hostId: 'local',
        hostLabel: 'This laptop',
        available: true,
        projectId: 'p',
        place: 'W3',
        title: 'Fix login',
        branch: null,
        createdAt: '2026-01-01T08:00:00.000Z',
        lastActivityAt: '2026-01-01T09:10:00.000Z',
        open: true,
        status: 'running',
        interactionMode: 'default',
        model: 'm',
        modelInstance: null,
        effort: null,
        pullRequests: [],
        firstUserMessage: '',
        questionRequestId: null,
        questions: [],
        lastAgentMessage: null,
      },
    ],
  });
  const entry = activityRows(page).first();
  await expect(entry.getByText('Answered on another device')).toBeVisible();
  await expect(entry.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(entry.getByRole('button', { name: /Answer/ })).toHaveCount(0);
});
