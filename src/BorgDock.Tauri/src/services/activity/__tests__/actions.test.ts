import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retired: false,
  opened: [] as string[],
  listed: [] as unknown[],
  page: [] as unknown[],
}));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    listSources: () =>
      Promise.resolve([
        { sourceId: 'deploy:x', retiredAt: mocks.retired ? '2026-10-27T10:00:00.000Z' : null },
      ]),
    mark: () => Promise.resolve({ previous: [], changed: 0, revision: 1 }),
    listEntries: (query: unknown) => {
      mocks.listed.push(query);
      return Promise.resolve({ entries: mocks.page, total: mocks.page.length, revision: 1 });
    },
  };
});
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (url: string) => {
    mocks.opened.push(url);
    return Promise.resolve();
  },
}));

import { buildRows } from '@/components/activity/rows';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { reachedEntry } from '../__fixtures__/entries';
import { act } from '../actions';

beforeEach(() => {
  mocks.retired = false;
  mocks.opened = [];
  mocks.listed = [];
  mocks.page = [];
});

describe('act', () => {
  const entry = { ...reachedEntry, sourceId: 'deploy:x' };

  it('runs the action of an entry whose source is still in settings', async () => {
    expect((await act(entry)).ran).toEqual(entry.action);
    expect(mocks.opened).toEqual(['https://github.com/acme/app/actions/runs/4047']);
  });

  it('runs nothing for an entry whose source was removed, wherever it is asked from', async () => {
    mocks.retired = true;
    const result = await act(entry);
    expect(result).toEqual({ ran: null, reason: 'Its source was removed from settings' });
    expect(mocks.opened).toEqual([]);
  });
});

describe('reveal', () => {
  it('clears every filter before it selects the entry, so the entry is in the page', async () => {
    useActivityViewStore.setState({
      filter: 'needs-you',
      group: 'ci',
      sourceId: 'gh:y',
      search: 'x',
    });
    await useActivityViewStore.getState().reveal('e1');
    const state = useActivityViewStore.getState();
    expect(mocks.listed.at(-1)).toMatchObject({
      filter: 'all',
      categories: [],
      sourceIds: [],
      search: null,
    });
    expect([state.selectedId, state.expandedId]).toEqual(['e1', 'e1']);
  });

  it('opens the fold an older update of the same entity sits in', async () => {
    const older = { ...reachedEntry, id: 'older', sourceAt: '2026-10-27T09:00:00.000Z' };
    const newer = { ...reachedEntry, id: 'newer', sourceAt: '2026-10-27T10:00:00.000Z' };
    mocks.page = [newer, older];
    await useActivityViewStore.getState().reveal('older');
    const { entries, openGroups } = useActivityViewStore.getState();
    const drawn = buildRows(entries, openGroups, new Date('2026-10-27T12:00:00.000Z'));
    expect(drawn.map((row) => row.key)).toContain('older');
  });
});
