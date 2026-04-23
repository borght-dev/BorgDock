import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdoClient } from '../client';
import {
  addWorkItemComment,
  buildIdPrefixWiql,
  createWorkItem,
  deleteWorkItem,
  downloadAttachment,
  getAssignedToMe,
  getCurrentUserDisplayName,
  getWorkItem,
  getWorkItemComments,
  getWorkItems,
  getWorkItemTypeStates,
  searchWorkItemsByIdPrefix,
  searchWorkItemsByText,
  updateWorkItem,
} from '../workitems';

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

    expect(client.get).toHaveBeenCalledWith('wit/workitems?ids=123&$expand=relations');
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
    expect(client.get).toHaveBeenCalledWith('wit/workitems/123?$expand=relations');
  });
});

describe('createWorkItem', () => {
  it('creates a work item with patch operations', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockResolvedValueOnce(fakeWorkItem);

    const fields = [{ op: 'add', path: '/fields/System.Title', value: 'Fix the bug' }];

    const result = await createWorkItem(client, 'Bug', fields);

    expect(result.id).toBe(123);
    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/$Bug',
      fields,
      'application/json-patch+json',
    );
  });

  it('encodes work item type in URL', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockResolvedValueOnce(fakeWorkItem);

    await createWorkItem(client, 'User Story', []);

    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/$User%20Story',
      [],
      'application/json-patch+json',
    );
  });
});

describe('updateWorkItem', () => {
  it('updates a work item with patch operations', async () => {
    const client = createMockClient();
    const updatedItem = {
      ...fakeWorkItem,
      fields: { ...fakeWorkItem.fields, 'System.State': 'Resolved' },
    };
    vi.mocked(client.patch).mockResolvedValueOnce(updatedItem);

    const operations = [{ op: 'replace', path: '/fields/System.State', value: 'Resolved' }];

    const result = await updateWorkItem(client, 123, operations);

    expect(result.fields['System.State']).toBe('Resolved');
    expect(client.patch).toHaveBeenCalledWith(
      'wit/workitems/123',
      operations,
      'application/json-patch+json',
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

describe('downloadAttachment', () => {
  it('downloads an attachment as a blob', async () => {
    const client = createMockClient();
    const fakeBlob = new Blob(['file content']);
    vi.mocked(client.getStream).mockResolvedValueOnce(fakeBlob);

    const result = await downloadAttachment(client, 'att-123', 'report.pdf');

    expect(result).toBe(fakeBlob);
    expect(client.getStream).toHaveBeenCalledWith('wit/attachments/att-123?fileName=report.pdf');
  });

  it('encodes the file name in the URL', async () => {
    const client = createMockClient();
    vi.mocked(client.getStream).mockResolvedValueOnce(new Blob());

    await downloadAttachment(client, 'att-456', 'file with spaces.pdf');

    expect(client.getStream).toHaveBeenCalledWith(
      'wit/attachments/att-456?fileName=file%20with%20spaces.pdf',
    );
  });
});

describe('getCurrentUserDisplayName', () => {
  it('returns the display name when available', async () => {
    const client = createMockClient();
    vi.mocked(client.getOrgLevel).mockResolvedValueOnce({
      authenticatedUser: { providerDisplayName: 'Jane Doe' },
    });

    const result = await getCurrentUserDisplayName(client);

    expect(result).toBe('Jane Doe');
    expect(client.getOrgLevel).toHaveBeenCalledWith('connectionData');
  });

  it('returns null when authenticatedUser is missing', async () => {
    const client = createMockClient();
    vi.mocked(client.getOrgLevel).mockResolvedValueOnce({});

    const result = await getCurrentUserDisplayName(client);

    expect(result).toBeNull();
  });

  it('returns null when providerDisplayName is missing', async () => {
    const client = createMockClient();
    vi.mocked(client.getOrgLevel).mockResolvedValueOnce({
      authenticatedUser: {},
    });

    const result = await getCurrentUserDisplayName(client);

    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    const client = createMockClient();
    vi.mocked(client.getOrgLevel).mockRejectedValueOnce(new Error('Network error'));

    const result = await getCurrentUserDisplayName(client);

    expect(result).toBeNull();
  });
});

describe('getWorkItemTypeStates', () => {
  it('returns state names', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [
        { name: 'New', color: '000000' },
        { name: 'Active', color: '007acc' },
        { name: 'Closed', color: '339933' },
      ],
    });

    const result = await getWorkItemTypeStates(client, 'Bug');

    expect(result).toEqual(['New', 'Active', 'Closed']);
    expect(client.get).toHaveBeenCalledWith('wit/workitemtypes/Bug/states');
  });

  it('encodes the work item type', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({ value: [] });

    await getWorkItemTypeStates(client, 'User Story');

    expect(client.get).toHaveBeenCalledWith('wit/workitemtypes/User%20Story/states');
  });

  it('returns empty array when value is undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({});

    const result = await getWorkItemTypeStates(client, 'Bug');

    expect(result).toEqual([]);
  });
});

describe('getWorkItemComments', () => {
  it('returns comments for a work item', async () => {
    const client = createMockClient();
    const fakeComments = [
      { id: 1, text: 'First comment', createdBy: { displayName: 'Alice' } },
      { id: 2, text: 'Second comment', createdBy: { displayName: 'Bob' } },
    ];
    vi.mocked(client.get).mockResolvedValueOnce({
      totalCount: 2,
      count: 2,
      comments: fakeComments,
    });

    const result = await getWorkItemComments(client, 123);

    expect(result).toEqual(fakeComments);
    expect(client.get).toHaveBeenCalledWith(
      'wit/workitems/123/comments?$top=200&order=asc',
      '7.1-preview.4',
    );
  });

  it('returns empty array when comments is undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({ totalCount: 0, count: 0 });

    const result = await getWorkItemComments(client, 123);

    expect(result).toEqual([]);
  });
});

describe('addWorkItemComment', () => {
  it('adds a comment to a work item', async () => {
    const client = createMockClient();
    const fakeComment = { id: 3, text: 'New comment' };
    vi.mocked(client.post).mockResolvedValueOnce(fakeComment);

    const result = await addWorkItemComment(client, 123, 'New comment');

    expect(result).toEqual(fakeComment);
    expect(client.post).toHaveBeenCalledWith(
      'wit/workitems/123/comments',
      { text: 'New comment' },
      undefined,
      '7.1-preview.4',
    );
  });
});

describe('buildIdPrefixWiql', () => {
  it('throws for empty prefix', () => {
    expect(() => buildIdPrefixWiql('')).toThrow('Prefix must be a non-empty numeric string.');
  });

  it('throws for non-numeric prefix', () => {
    expect(() => buildIdPrefixWiql('abc')).toThrow('Prefix must be a non-empty numeric string.');
  });

  it('builds WIQL for single-digit prefix', () => {
    const wiql = buildIdPrefixWiql('5');

    expect(wiql).toContain('[System.Id] = 5');
    // Should have range clauses for 2-digit through 7-digit ids starting with 5
    expect(wiql).toContain('[System.Id] >= 50 AND [System.Id] <= 59');
    expect(wiql).toContain('[System.Id] >= 500 AND [System.Id] <= 599');
  });

  it('builds WIQL for multi-digit prefix', () => {
    const wiql = buildIdPrefixWiql('12');

    expect(wiql).toContain('[System.Id] = 12');
    expect(wiql).toContain('[System.Id] >= 120 AND [System.Id] <= 129');
    expect(wiql).toContain('SELECT [System.Id] FROM WorkItems WHERE');
  });

  it('does not generate ranges beyond 7 total digits', () => {
    const wiql = buildIdPrefixWiql('1234567');

    // Only exact match, no range clauses (already 7 digits)
    expect(wiql).toBe('SELECT [System.Id] FROM WorkItems WHERE [System.Id] = 1234567');
  });
});

describe('searchWorkItemsByIdPrefix', () => {
  it('searches by ID prefix and returns work items', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({
      workItems: [
        { id: 123, url: '' },
        { id: 1234, url: '' },
      ],
    });
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [fakeWorkItem, { ...fakeWorkItem, id: 1234 }],
    });

    const result = await searchWorkItemsByIdPrefix(client, '123');

    expect(result).toHaveLength(2);
    expect(client.post).toHaveBeenCalledWith(
      'wit/wiql?$top=20',
      expect.objectContaining({ query: expect.stringContaining('[System.Id] = 123') }),
    );
  });

  it('returns empty array when no matching work items', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({ workItems: [] });

    const result = await searchWorkItemsByIdPrefix(client, '999');

    expect(result).toEqual([]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('handles undefined workItems in response', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({});

    const result = await searchWorkItemsByIdPrefix(client, '123');

    expect(result).toEqual([]);
  });
});

describe('getAssignedToMe', () => {
  it('returns work items assigned to current user', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({
      workItems: [{ id: 123, url: '' }],
    });
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [fakeWorkItem],
    });

    const result = await getAssignedToMe(client);

    expect(result).toHaveLength(1);
    expect(client.post).toHaveBeenCalledWith(
      'wit/wiql?$top=20',
      expect.objectContaining({
        query: expect.stringContaining('[System.AssignedTo] = @Me'),
      }),
    );
  });

  it('returns empty array when no items assigned', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({ workItems: [] });

    const result = await getAssignedToMe(client);

    expect(result).toEqual([]);
  });

  it('returns empty array when workItems is undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({});

    const result = await getAssignedToMe(client);

    expect(result).toEqual([]);
  });
});

describe('searchWorkItemsByText', () => {
  it('searches by text and returns work items', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({
      workItems: [{ id: 123, url: '' }],
    });
    vi.mocked(client.get).mockResolvedValueOnce({
      value: [fakeWorkItem],
    });

    const result = await searchWorkItemsByText(client, 'login bug');

    expect(result).toHaveLength(1);
    expect(client.post).toHaveBeenCalledWith(
      'wit/wiql?$top=20',
      expect.objectContaining({
        query: expect.stringContaining("CONTAINS 'login bug'"),
      }),
    );
  });

  it('escapes single quotes in search text', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({ workItems: [] });

    await searchWorkItemsByText(client, "can't login");

    expect(client.post).toHaveBeenCalledWith(
      'wit/wiql?$top=20',
      expect.objectContaining({
        query: expect.stringContaining("CONTAINS 'can''t login'"),
      }),
    );
  });

  it('returns empty array when no matching items', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({ workItems: [] });

    const result = await searchWorkItemsByText(client, 'nonexistent');

    expect(result).toEqual([]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('returns empty array when workItems is undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce({});

    const result = await searchWorkItemsByText(client, 'something');

    expect(result).toEqual([]);
  });
});

describe('getWorkItems edge cases', () => {
  it('handles response with undefined value', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({});

    const result = await getWorkItems(client, [1]);

    expect(result).toEqual([]);
  });
});
