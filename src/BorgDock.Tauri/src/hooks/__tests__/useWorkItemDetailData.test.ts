import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ado = vi.hoisted(() => ({
  getWorkItem: vi.fn(),
  getWorkItemComments: vi.fn(),
  getWorkItemTypeStates: vi.fn(),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

vi.mock('@/services/ado/workitems', () => ado);
vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(function MockAdoClient() {
    return { get: vi.fn(), getStream: vi.fn() };
  }),
}));
vi.mock('@/services/ado/fields', () => ({
  getProjectFields: vi.fn().mockResolvedValue([]),
  indexFieldsByRef: vi.fn(() => new Map()),
}));
vi.mock('@/services/ado/layout', () => ({
  getProjectProcessId: vi.fn().mockResolvedValue(null),
  getProcessWitTypeRefs: vi.fn().mockResolvedValue(new Map()),
  getProcessLayout: vi.fn().mockResolvedValue(null),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import {
  toWorkItemDetailData,
  useWorkItemDetailData,
  workItemPatch,
} from '../useWorkItemDetailData';

function makeItem(id: number, fields: Record<string, unknown> = {}, rev = 1): WorkItem {
  return {
    id,
    rev,
    url: `https://dev.azure.com/org/proj/_apis/wit/workItems/${id}`,
    fields: {
      'System.Title': `Item ${id}`,
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Alice' },
      'System.Tags': '',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.IterationPath': 'Proj\\Sprint 7',
      ...fields,
    },
    relations: [],
    htmlUrl: '',
  };
}

const settingsBefore = useSettingsStore.getState().settings;

describe('useWorkItemDetailData', () => {
  beforeEach(() => {
    for (const fn of Object.values(ado)) fn.mockReset();
    ado.getWorkItemComments.mockResolvedValue([]);
    ado.getWorkItemTypeStates.mockResolvedValue(['New', 'Active', 'Resolved']);
    useSettingsStore.setState({
      settings: {
        ...settingsBefore,
        azureDevOps: {
          ...settingsBefore.azureDevOps,
          organization: 'org',
          project: 'proj',
          personalAccessToken: 'pat',
          authMethod: 'pat',
        },
      },
    });
    useWorkItemsStore.setState({ workItems: [], fieldDefinitions: null });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: settingsBefore });
    useWorkItemsStore.setState({ workItems: [] });
  });

  it('seeds from the store: the item shows at once, without a spinner', async () => {
    const listed = makeItem(7);
    useWorkItemsStore.setState({ workItems: [listed] });
    ado.getWorkItem.mockReturnValue(new Promise(() => {})); // the fetch never lands
    const { result } = renderHook(() => useWorkItemDetailData(7));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.workItem).toBe(listed);
    expect(result.current.detailData).toMatchObject({
      id: 7,
      title: 'Item 7',
      state: 'Active',
      workItemType: 'Bug',
      assignedTo: 'Alice',
      priority: 2,
      iteration: 'Sprint 7',
      htmlUrl: 'https://dev.azure.com/org/proj/_workitems/edit/7',
    });
    await waitFor(() => expect(ado.getWorkItem).toHaveBeenCalledWith(expect.anything(), 7));
  });

  it('loads an item the list does not hold, then its states and comments', async () => {
    const full = makeItem(9, { 'System.Title': 'Fetched' });
    ado.getWorkItem.mockResolvedValue(full);
    ado.getWorkItemComments.mockResolvedValue([{ id: 1, text: 'hi' }]);
    const { result } = renderHook(() => useWorkItemDetailData(9));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.detailData).toBeNull();
    await waitFor(() => expect(result.current.detailData?.title).toBe('Fetched'));
    await waitFor(() =>
      expect(result.current.availableStates).toEqual(['New', 'Active', 'Resolved']),
    );
    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
    expect(ado.getWorkItemTypeStates).toHaveBeenCalledWith(expect.anything(), 'Bug');
  });

  it('follows the list when a poll brings a newer revision', async () => {
    useWorkItemsStore.setState({ workItems: [makeItem(7)] });
    ado.getWorkItem.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWorkItemDetailData(7));
    act(() => {
      useWorkItemsStore.setState({ workItems: [makeItem(7, { 'System.State': 'Resolved' }, 2)] });
    });
    expect(result.current.detailData?.state).toBe('Resolved');
  });

  it('reports a failed load when there is nothing to show', async () => {
    ado.getWorkItem.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useWorkItemDetailData(9));
    await waitFor(() => expect(result.current.error).toBe('Failed to load work item'));
  });

  it('saves the changed fields and puts the result in the list', async () => {
    const listed = makeItem(7);
    useWorkItemsStore.setState({ workItems: [listed] });
    ado.getWorkItem.mockResolvedValue(listed);
    const saved = makeItem(7, { 'System.State': 'Resolved' }, 2);
    ado.updateWorkItem.mockResolvedValue(saved);
    const { result } = renderHook(() => useWorkItemDetailData(7));
    await waitFor(() => expect(ado.getWorkItem).toHaveBeenCalled());
    await act(() =>
      result.current.save({
        title: 'Item 7',
        state: 'Resolved',
        assignedTo: 'Alice',
        priority: 2,
        tags: '',
        iteration: 'Sprint 7',
      }),
    );
    expect(ado.updateWorkItem).toHaveBeenCalledWith(expect.anything(), 7, [
      { op: 'replace', path: '/fields/System.State', value: 'Resolved' },
    ]);
    expect(useWorkItemsStore.getState().workItems[0]).toBe(saved);
    expect(result.current.statusText).toBe('Saved');
  });

  it('delete removes the item from the list and reports success', async () => {
    useWorkItemsStore.setState({ workItems: [makeItem(7), makeItem(8)] });
    ado.getWorkItem.mockReturnValue(new Promise(() => {}));
    ado.deleteWorkItem.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkItemDetailData(7));
    let gone = false;
    await act(async () => {
      gone = await result.current.remove();
    });
    expect(gone).toBe(true);
    expect(useWorkItemsStore.getState().workItems.map((w) => w.id)).toEqual([8]);
  });

  it("switching ids (the pop-out's arrows) never shows the previous item's data", async () => {
    ado.getWorkItem.mockImplementation(async (_c: unknown, id: number) =>
      id === 1 ? makeItem(1, { 'System.Title': 'First' }) : new Promise(() => {}),
    );
    ado.getWorkItemComments.mockImplementation(async (_c: unknown, id: number) =>
      id === 1 ? [{ id: 11, text: 'on the first' }] : new Promise(() => {}),
    );
    const { result, rerender } = renderHook(({ id }) => useWorkItemDetailData(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    expect(result.current.availableStates).toEqual(['New', 'Active', 'Resolved']);

    rerender({ id: 2 });
    expect(result.current.workItem).toBeNull();
    expect(result.current.detailData).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.comments).toEqual([]);
    expect(result.current.availableStates).toEqual([]);
  });

  it('switching to an id the list holds shows that item at once', async () => {
    ado.getWorkItem.mockImplementation(async (_c: unknown, id: number) =>
      id === 1 ? makeItem(1) : new Promise(() => {}),
    );
    useWorkItemsStore.setState({
      workItems: [makeItem(1), makeItem(2, { 'System.Title': 'Two' })],
    });
    const { result, rerender } = renderHook(({ id }) => useWorkItemDetailData(id), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });
    expect(result.current.detailData?.title).toBe('Two');
    expect(result.current.isLoading).toBe(false);
  });

  it('uses the settings `prepare` returns (the pop-out) and reports a missing id', async () => {
    const prepare = vi.fn().mockResolvedValue(useSettingsStore.getState().settings.azureDevOps);
    const { result } = renderHook(() => useWorkItemDetailData(null, { prepare }));
    await waitFor(() => expect(result.current.error).toBe('No work item ID provided'));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(ado.getWorkItem).not.toHaveBeenCalled();
  });
});

describe('workItemPatch and toWorkItemDetailData', () => {
  it('patches only what changed and rebuilds the iteration path from its last segment', () => {
    const item = makeItem(1);
    expect(
      workItemPatch(item, {
        title: 'Item 1',
        state: 'Active',
        assignedTo: 'Alice',
        priority: 1,
        tags: '',
        iteration: 'Sprint 8',
      }),
    ).toEqual([
      { op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: 1 },
      { op: 'replace', path: '/fields/System.IterationPath', value: 'Proj\\Sprint 8' },
    ]);
  });

  it('prefers the item web URL over the built one', () => {
    const item = { ...makeItem(1), htmlUrl: 'https://example.test/1' };
    expect(toWorkItemDetailData(item, { organization: 'o', project: 'p' }).htmlUrl).toBe(
      'https://example.test/1',
    );
  });
});
