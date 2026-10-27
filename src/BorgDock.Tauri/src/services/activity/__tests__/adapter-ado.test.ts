import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJournal } from './fake-journal';

const mocks = vi.hoisted(() => ({ journal: null as unknown as FakeJournal }));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    openSource: (request: Parameters<FakeJournal['openSource']>[0]) =>
      mocks.journal.openSource(request),
    commit: (request: Parameters<FakeJournal['commit']>[0]) => mocks.journal.commit(request),
  };
});

import { makeItem } from '@/services/dispatch/__tests__/fixtures';
import type { DispatchItem } from '@/services/dispatch/types';
import { useSettingsStore } from '@/stores/settings-store';
import { ingestAdoItems } from '../adapters/ado';
import { ingestIdle, resetActivityIngest } from '../ingest';

const SOURCE = 'ado:org/proj';

function item(overrides: Partial<DispatchItem> = {}): DispatchItem {
  return makeItem({
    id: 42,
    title: 'Login fails on Safari',
    state: 'Committed',
    assignedToMe: true,
    rev: 5,
    changedBy: 'Koen van der Borght',
    changedByMe: true,
    ...overrides,
  });
}

let clock = Date.parse('2026-10-27T10:00:00Z');
async function read(items: DispatchItem[]) {
  ingestAdoItems(items, (clock += 60_000));
  await ingestIdle(SOURCE);
}

beforeEach(() => {
  mocks.journal = new FakeJournal();
  resetActivityIngest();
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      azureDevOps: { ...settings.azureDevOps, organization: 'Org', project: 'Proj' },
    },
  });
});

describe('the ADO adapter', () => {
  it('adds nothing for my own changes', async () => {
    await read([item()]);
    await read([item({ rev: 6, state: 'Code Review' })]);
    expect(mocks.journal.entries.size).toBe(0);
  });

  it('adds one entry each for someone else moving my item and commenting on it', async () => {
    await read([item()]);
    await read([
      item({
        rev: 6,
        state: 'Code Review',
        changedBy: 'Ann',
        changedByMe: false,
        lastComment: {
          id: 900,
          author: 'Ann',
          at: '2026-10-27T10:30:00Z',
          text: 'Ready?',
          byMe: false,
        },
      }),
    ]);
    expect(mocks.journal.categories().sort()).toEqual(['ado.comment', 'ado.state']);
    expect([...mocks.journal.entries.values()][0]?.entityKey).toBe('ado:org/proj:42');
  });

  it('reports a signed comment from my account as an agent report', async () => {
    await read([item()]);
    await read([
      item({
        rev: 6,
        lastComment: {
          id: 901,
          author: 'Vera · plan',
          at: '2026-10-27T10:30:00Z',
          text: 'Plan posted',
          byMe: false,
        },
      }),
    ]);
    expect(mocks.journal.categories()).toEqual(['agent.report']);
  });
});
