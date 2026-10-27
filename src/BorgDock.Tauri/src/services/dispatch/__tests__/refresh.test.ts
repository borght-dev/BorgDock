import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../items', () => ({ loadDispatchItems: vi.fn() }));
vi.mock('../linked-prs', () => ({
  candidateRepositories: () => [],
  fetchFromGitHub: vi.fn(),
  lookUpLinkedPullRequests: vi.fn().mockResolvedValue({ pullRequests: [], repositories: {} }),
}));

import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { loadDispatchItems } from '../items';
import { resetHostSync, syncItems } from '../sync';
import type { DispatchItem } from '../types';
import { runProgress } from '../walk';
import { makeItem } from './fixtures';

describe('Dispatch refresh', () => {
  beforeEach(() => {
    resetHostSync();
    vi.mocked(loadDispatchItems).mockReset();
    useSettingsStore.setState(({ settings }) => ({
      settings: {
        ...settings,
        azureDevOps: {
          ...settings.azureDevOps,
          organization: 'org',
          project: 'project',
          authMethod: 'azCli',
        },
      },
    }));
    useDispatchStore.setState({ items: [], threads: [], projects: [], overview: null });
  });

  it('starts a new connection read and rejects the old projects late response', async () => {
    let finishOld!: (items: DispatchItem[]) => void;
    const fresh = makeItem({ id: 2 });
    vi.mocked(loadDispatchItems)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce([fresh]);
    const old = syncItems();
    expect(loadDispatchItems).toHaveBeenCalledTimes(1);
    useSettingsStore.setState(({ settings }) => ({
      settings: { ...settings, azureDevOps: { ...settings.azureDevOps, project: 'new-project' } },
    }));
    await syncItems();
    expect(loadDispatchItems).toHaveBeenLastCalledWith(
      expect.anything(),
      { organization: 'org', project: 'new-project' },
      expect.any(Array),
    );
    expect(useDispatchStore.getState().items).toEqual([fresh]);
    finishOld([makeItem({ id: 1 })]);
    await old;
    expect(useDispatchStore.getState().items).toEqual([fresh]);
  });

  it('reads again after an in-flight poll and updates the batch count', async () => {
    let answer!: (items: DispatchItem[]) => void;
    const old = makeItem({ id: 1, state: 'Code Review' });
    const updated = makeItem({ id: 1, state: 'Ready For QA' });
    vi.mocked(loadDispatchItems)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }),
      )
      .mockResolvedValueOnce([updated]);
    const polling = syncItems();
    expect(loadDispatchItems).toHaveBeenCalledTimes(1);
    const refreshing = syncItems(true);
    const anotherRefresh = syncItems(true);
    answer([old]);
    await Promise.all([polling, refreshing, anotherRefresh]);
    expect(loadDispatchItems).toHaveBeenCalledTimes(2);
    expect(useDispatchStore.getState().items).toEqual([updated]);
    expect(
      runProgress(
        { itemIds: [1], fromStates: { 1: 'Code Review' } },
        useDispatchStore.getState().overview!.items,
      ).moved,
    ).toBe(1);
  });
});
