import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdoClient } from '../client';
import { executeQuery, getQueryTree } from '../queries';

vi.mock('../workitems', () => ({
  getWorkItems: vi.fn(),
}));

import { getWorkItems } from '../workitems';

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

describe('getQueryTree', () => {
  let client: AdoClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('fetches queries with depth=2 and expand=minimal', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({ value: [] });

    await getQueryTree(client);

    expect(client.get).toHaveBeenCalledWith('wit/queries?$depth=2&$expand=minimal');
  });

  it('returns empty array when response value is empty', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({ value: [] });

    const result = await getQueryTree(client);

    expect(result).toEqual([]);
  });

  it('returns empty array when response value is undefined', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({});

    const result = await getQueryTree(client);

    expect(result).toEqual([]);
  });

  it('maps flat query items to AdoQuery objects', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [
        {
          id: 'q1',
          name: 'My Bugs',
          path: 'Shared Queries/My Bugs',
          isFolder: false,
          hasChildren: false,
        },
      ],
    });

    const result = await getQueryTree(client);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'q1',
      name: 'My Bugs',
      path: 'Shared Queries/My Bugs',
      isFolder: false,
      hasChildren: false,
      children: [],
    });
  });

  it('maps nested query items recursively', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [
        {
          id: 'folder1',
          name: 'Shared Queries',
          path: 'Shared Queries',
          isFolder: true,
          hasChildren: true,
          children: [
            {
              id: 'q1',
              name: 'Active Bugs',
              path: 'Shared Queries/Active Bugs',
              isFolder: false,
              hasChildren: false,
            },
            {
              id: 'q2',
              name: 'My Tasks',
              path: 'Shared Queries/My Tasks',
              isFolder: false,
              hasChildren: false,
            },
          ],
        },
      ],
    });

    const result = await getQueryTree(client);

    expect(result).toHaveLength(1);
    expect(result[0]!.isFolder).toBe(true);
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children[0]!.id).toBe('q1');
    expect(result[0]!.children[1]!.id).toBe('q2');
  });

  it('handles missing children array on folder items', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [
        {
          id: 'folder1',
          name: 'Empty Folder',
          path: 'Shared Queries/Empty Folder',
          isFolder: true,
          hasChildren: false,
        },
      ],
    });

    const result = await getQueryTree(client);

    expect(result[0]!.children).toEqual([]);
  });

  it('maps multiple top-level items', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [
        { id: 'a', name: 'A', path: 'A', isFolder: false, hasChildren: false },
        { id: 'b', name: 'B', path: 'B', isFolder: false, hasChildren: false },
        { id: 'c', name: 'C', path: 'C', isFolder: true, hasChildren: false },
      ],
    });

    const result = await getQueryTree(client);

    expect(result).toHaveLength(3);
    expect(result.map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('executeQuery', () => {
  let client: AdoClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('calls wiql endpoint with query id', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [{ id: 1, url: 'https://example.com/1' }],
    });
    vi.mocked(getWorkItems).mockResolvedValueOnce([
      { id: 1, rev: 1, url: '', fields: {}, relations: [], htmlUrl: '' },
    ]);

    await executeQuery(client, 'query-abc-123');

    expect(client.get).toHaveBeenCalledWith('wit/wiql/query-abc-123');
  });

  it('returns empty array when query returns no work items', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [],
    });

    const result = await executeQuery(client, 'empty-query');

    expect(result).toEqual([]);
    expect(getWorkItems).not.toHaveBeenCalled();
  });

  it('returns empty array when workItems is undefined', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      queryType: 'flat',
    });

    const result = await executeQuery(client, 'undefined-query');

    expect(result).toEqual([]);
    expect(getWorkItems).not.toHaveBeenCalled();
  });

  it('passes work item ids to getWorkItems', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [
        { id: 10, url: 'https://example.com/10' },
        { id: 20, url: 'https://example.com/20' },
        { id: 30, url: 'https://example.com/30' },
      ],
    });
    vi.mocked(getWorkItems).mockResolvedValueOnce([]);

    await executeQuery(client, 'multi-items');

    expect(getWorkItems).toHaveBeenCalledWith(client, [10, 20, 30]);
  });

  it('returns work items from getWorkItems', async () => {
    const fakeItems = [
      { id: 5, rev: 1, url: '', fields: { 'System.Title': 'Task A' }, relations: [], htmlUrl: '' },
      { id: 6, rev: 2, url: '', fields: { 'System.Title': 'Task B' }, relations: [], htmlUrl: '' },
    ];

    vi.mocked(client.get).mockResolvedValueOnce({
      queryType: 'flat',
      workItems: [
        { id: 5, url: '' },
        { id: 6, url: '' },
      ],
    });
    vi.mocked(getWorkItems).mockResolvedValueOnce(fakeItems);

    const result = await executeQuery(client, 'some-query');

    expect(result).toEqual(fakeItems);
  });
});
