import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkItems, getWorkItem, createWorkItem, updateWorkItem, deleteWorkItem } from '../workitems';
import { AdoClient } from '../client';

function createMockClient() {
  return {
    get: vi.fn(),
    getOrgLevel: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getStream: vi.fn(),
    testConnection: vi.fn(),
    isConfigured: true,
  } as unknown as AdoClient;
}

const fakeWorkItem = {
  id: 123,
  rev: 1,
  url: 'https://dev.azure.com/org/project/_apis/wit/workitems/123',
  fields: {
    'System.Title': 'Fix the bug',
    'System.State': 'Active',
    'System.WorkItemType': 'Bug',
  },
  relations: [],
  htmlUrl: '',
};

describe('getWorkItems', () => {
  let client: AdoClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns empty array for empty ids', async () => {
    const result = await getWorkItems(client, []);
    expect(result).toEqual([]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('fetches and returns work items', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [fakeWorkItem],
    });

    const result = await getWorkItems(client, [123]);

    expect(result).toHaveLength(1);
    const item = result[0]!;
    expect(item.id).toBe(123);
    expect(item.fields['System.Title']).toBe('Fix the bug');

    expect(client.get).toHaveBeenCalledWith(
      'wit/workitems?ids=123&$expand=relations'
    );
  });

  it('batches requests in groups of 200', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);

    vi.mocked(client.get)
      .mockResolvedValueOnce({ value: [fakeWorkItem] })
      .mockResolvedValueOnce({ value: [{ ...fakeWorkItem, id: 201 }] });

    const result = await getWorkItems(client, ids);

    expect(result).toHaveLength(2);
    expect(client.get).toHaveBeenCalledTimes(2);

    // First batch: 1-200
    const calls = vi.mocked(client.get).mock.calls;
    const firstIds = (calls[0]![0] as string).split('ids=')[1]!.split('&')[0]!.split(',');
    expect(firstIds.length).toBe(200);

    // Second batch: 201-250
    const secondIds = (calls[1]![0] as string).split('ids=')[1]!.split('&')[0]!.split(',');
    expect(secondIds.length).toBe(50);
  });
});

describe('getWorkItem', () => {
  it('fetches a single work item with relations', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce(fakeWorkItem);

    const result = await getWorkItem(client, 123);

    expect(result.id).toBe(123);
    expect(client.get).toHaveBeenCalledWith(
      'wit/workitems/123?$expand=relations'
    );
  });
});

describe('createWorkItem', () => {
  it('creates a work item with patch operations', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockResolvedValueOnce(fakeWorkItem);

    const fields = [
      { op: 'add', path: '/fields/System.Title', value: 'Fix the bug' },
    ];

    const result = await createWorkItem(client, 'Bug', fields);

    expect(result.id).toBe(123);
    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/$Bug',
      fields,
      'application/json-patch+json'
    );
  });

  it('encodes work item type in URL', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockResolvedValueOnce(fakeWorkItem);

    await createWorkItem(client, 'User Story', []);

    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/$User%20Story',
      [],
      'application/json-patch+json'
    );
  });
});

describe('updateWorkItem', () => {
  it('updates a work item with patch operations', async () => {
    const client = createMockClient();
    const updatedItem = { ...fakeWorkItem, fields: { ...fakeWorkItem.fields, 'System.State': 'Resolved' } };
    vi.mocked(client.patch).mockResolvedValueOnce(updatedItem);

    const operations = [
      { op: 'replace', path: '/fields/System.State', value: 'Resolved' },
    ];

    const result = await updateWorkItem(client, 123, operations);

    expect(result.fields['System.State']).toBe('Resolved');
    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/123',
      operations,
      'application/json-patch+json'
    );
  });
});

describe('deleteWorkItem', () => {
  it('deletes a work item', async () => {
    const client = createMockClient();
    vi.mocked(client.delete).mockResolvedValueOnce(undefined);

    await deleteWorkItem(client, 123);

    expect(client.delete).toHaveBeenCalledWith('wit/workitems/123');
  });
});
