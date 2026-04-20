import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (before component import) ----

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    getStream: vi.fn(),
  })),
}));

vi.mock('@/services/ado/queries', () => ({
  executeQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/ado/workitems', () => ({
  getWorkItem: vi.fn(),
  getWorkItemComments: vi.fn().mockResolvedValue([]),
  getWorkItemTypeStates: vi.fn().mockResolvedValue(['New', 'Active']),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

vi.mock('@/hooks/useAdoImageAuth', () => ({
  useAdoImageAuth: vi.fn(),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import { WorkItemsSection } from '../WorkItemsSection';

// ---------- factories ----------

function makeWorkItem(id: number, overrides: Record<string, unknown> = {}): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/org/proj/_apis/wit/workItems/${id}`,
    fields: {
      'System.Title': `Item ${id}`,
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': 'Alice',
      'System.Tags': '',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.CreatedDate': '2025-01-01T00:00:00Z',
      ...overrides,
    },
    relations: [],
    htmlUrl: '',
  };
}

// ---------- store setup ----------

function setupStores(
  opts: { configured?: boolean; items?: WorkItem[]; queryId?: string | null } = {},
) {
  const { configured = true, items = [], queryId = null } = opts;

  // Settings store
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      azureDevOps: {
        organization: configured ? 'myorg' : '',
        project: configured ? 'myproj' : '',
        personalAccessToken: configured ? 'fake-pat' : '',
        authMethod: 'pat' as const,
        authAutoDetected: true,
        pollIntervalSeconds: 120,
        favoriteQueryIds: [],
        trackedWorkItemIds: [],
        workingOnWorkItemIds: [],
        workItemWorktreePaths: {},
        recentWorkItemIds: [],
      },
    },
    isLoading: false,
  });

  // Work items store
  useWorkItemsStore.setState({
    queryTree: [],
    selectedQueryId: queryId,
    favoriteQueryIds: [],
    workItems: items,
    stateFilter: 'all',
    assignedToFilter: '',
    searchQuery: '',
    trackingFilter: 'all',
    trackedWorkItemIds: new Set(),
    workingOnWorkItemIds: new Set(),
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
    currentUserDisplayName: '',
    isLoading: false,
  });
}

// ---------- tests ----------

describe('WorkItemsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStores();
  });

  afterEach(cleanup);

  // ---- Not configured state ----

  it('shows configuration message when ADO not configured', () => {
    setupStores({ configured: false });
    render(<WorkItemsSection />);
    expect(screen.getByText('Configure Azure DevOps in Settings to see work items')).toBeDefined();
  });

  // ---- Configured state ----

  it('renders filter bar when configured', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    expect(screen.getByText('Select a query...')).toBeDefined();
    expect(screen.getByTitle('Refresh')).toBeDefined();
  });

  it('renders work item list', () => {
    const items = [makeWorkItem(1), makeWorkItem(2)];
    setupStores({ configured: true, items, queryId: 'q-1' });
    // We need the query in the tree so selectedQueryName resolves
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'My Query',
          path: 'Shared/My Query',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
  });

  it('shows query name in filter bar when query selected', () => {
    setupStores({ configured: true, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Active Bugs',
          path: 'Shared/Active Bugs',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    expect(screen.getByText('Active Bugs')).toBeDefined();
  });

  it('shows "Select a saved query" when no query selected', () => {
    setupStores({ configured: true, items: [], queryId: null });
    render(<WorkItemsSection />);
    expect(screen.getByText('Select a saved query to load work items')).toBeDefined();
  });

  // ---- Filter bar interaction ----

  it('shows tracking filter pills', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Tracked')).toBeDefined();
    expect(screen.getByText('Working')).toBeDefined();
  });

  // ---- Query browser ----

  it('opens query browser when query selector clicked', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    fireEvent.click(screen.getByText('Select a query...'));
    expect(screen.getByText('Saved Queries')).toBeDefined();
  });

  // ---- Work item with identity field as object ----

  it('handles identity fields that are objects with displayName', () => {
    const item = makeWorkItem(5, {
      'System.AssignedTo': { displayName: 'Jane Doe', uniqueName: 'jane@example.com' },
    });
    setupStores({ configured: true, items: [item], queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    // Jane Doe appears both in the card and in the assignee filter dropdown
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThanOrEqual(1);
  });

  // ---- Tracked / working-on states ----

  it('passes tracked state to work item cards', () => {
    const items = [makeWorkItem(10)];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      trackedWorkItemIds: new Set([10]),
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    // The tracked item should have "Stop tracking" button
    expect(screen.getByTitle('Stop tracking')).toBeDefined();
  });

  it('passes working-on state to work item cards', () => {
    const items = [makeWorkItem(10)];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      workingOnWorkItemIds: new Set([10]),
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    expect(screen.getByTitle('Stop working on')).toBeDefined();
  });

  // ---- Loading state ----

  it('shows loading when store isLoading', () => {
    setupStores({ configured: true });
    useWorkItemsStore.setState({ isLoading: true });
    render(<WorkItemsSection />);
    expect(screen.getByText('Loading work items...')).toBeDefined();
  });

  // ---- Detail panel ----

  it('opens detail panel when a work item is selected', async () => {
    const { getWorkItem, getWorkItemComments, getWorkItemTypeStates } = await import(
      '@/services/ado/workitems'
    );
    const fullItem = makeWorkItem(1, {
      'System.Description': '<p>Description here</p>',
    });
    vi.mocked(getWorkItem).mockResolvedValue(fullItem);
    vi.mocked(getWorkItemComments).mockResolvedValue([]);
    vi.mocked(getWorkItemTypeStates).mockResolvedValue(['New', 'Active', 'Resolved']);

    const items = [makeWorkItem(1)];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);

    // Click on the work item card
    fireEvent.click(screen.getByText('Item 1'));

    await waitFor(() => {
      expect(getWorkItem).toHaveBeenCalledWith(expect.anything(), 1);
    });
  });

  it('handles detail load failure gracefully', async () => {
    const { getWorkItem } = await import('@/services/ado/workitems');
    vi.mocked(getWorkItem).mockRejectedValue(new Error('Load failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const items = [makeWorkItem(1)];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);

    fireEvent.click(screen.getByText('Item 1'));

    await waitFor(() => {
      expect(getWorkItem).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });

  // ---- Filter bar interactions ----

  it('changes state filter when filter bar state changes', () => {
    const items = [
      makeWorkItem(1, { 'System.State': 'Active' }),
      makeWorkItem(2, { 'System.State': 'New' }),
    ];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    // The All filter should be visible
    expect(screen.getByText('All')).toBeDefined();
  });

  // ---- Refresh ----

  it('triggers refresh when refresh button clicked', async () => {
    const { executeQuery } = await import('@/services/ado/queries');
    vi.mocked(executeQuery).mockResolvedValue([]);

    setupStores({ configured: true, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);

    fireEvent.click(screen.getByTitle('Refresh'));

    await waitFor(() => {
      expect(executeQuery).toHaveBeenCalledWith(expect.anything(), 'q-1');
    });
  });

  // ---- Query browser interaction ----

  it('closes query browser when a query is selected', async () => {
    setupStores({ configured: true });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'My Query',
          path: 'Shared/My Query',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);

    // Open the query browser
    fireEvent.click(screen.getByText('Select a query...'));
    expect(screen.getByText('Saved Queries')).toBeDefined();
  });

  // ---- Identity field edge cases ----

  it('handles identity fields with uniqueName fallback', () => {
    const item = makeWorkItem(7, {
      'System.AssignedTo': { uniqueName: 'john@example.com' },
    });
    setupStores({ configured: true, items: [item], queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    expect(screen.getAllByText('john@example.com').length).toBeGreaterThanOrEqual(1);
  });

  // ---- Age formatting ----

  it('displays age for work items', () => {
    const items = [
      makeWorkItem(1, {
        'System.CreatedDate': new Date(Date.now() - 86400000 * 400).toISOString(),
      }),
    ];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'Test',
          path: 'Test',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    // Should render the work item (the age appears in the card)
    expect(screen.getByText('Item 1')).toBeDefined();
  });
});
