import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (before component import) ----

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(function MockAdoClient() {
    return {
      get: vi.fn(),
      getStream: vi.fn(),
    };
  }),
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
import { useUiStore } from '@/stores/ui-store';
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
        linkMatchBy: 'branch' as const,
        showWorkItemStateOnPrCard: true,
        updatePrStatusWhenWiDone: false,
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

  // Ui store — clear any prior selection
  useUiStore.setState({ workItemsSelectedId: null });
}

describe('WorkItemsSection (3-pane)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStores();
  });

  afterEach(cleanup);

  // ---- Not configured state ----

  it('shows configuration message when ADO not configured', () => {
    setupStores({ configured: false });
    render(<WorkItemsSection />);
    expect(
      screen.getByText('Configure Azure DevOps in Settings to see work items'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument();
  });

  // ---- 3-pane shell ----

  it('renders the queries rail with Favorites and My Queries headings', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('My Queries')).toBeInTheDocument();
    expect(screen.getByText(/Browse all queries/)).toBeInTheDocument();
  });

  it('shows "Pick a query from the rail" when no query is selected', () => {
    setupStores({ configured: true, queryId: null });
    render(<WorkItemsSection />);
    expect(screen.getByText('Pick a query from the rail')).toBeInTheDocument();
  });

  it('shows "Select a work item" empty state in detail pane when nothing selected', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    expect(screen.getByText('Select a work item')).toBeInTheDocument();
  });

  it('shows the items toolbar with a filter input', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    expect(screen.getByLabelText('Filter items')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter')).toBeInTheDocument();
  });

  // ---- Items list ----

  it('renders work items as compact rows', () => {
    const items = [makeWorkItem(1), makeWorkItem(2)];
    setupStores({ configured: true, items, queryId: 'q-1' });
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
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('AB#1')).toBeInTheDocument();
    expect(screen.getByText('AB#2')).toBeInTheDocument();
  });

  it('shows "No items in {queryName}" when query selected but empty', () => {
    setupStores({ configured: true, items: [], queryId: 'q-1' });
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
    expect(screen.getByText(/No items in Active Bugs/)).toBeInTheDocument();
  });

  // ---- Local search ----

  it('filters rows client-side by typing in the search input', () => {
    const items = [
      makeWorkItem(101, { 'System.Title': 'Quote footer broken' }),
      makeWorkItem(202, { 'System.Title': 'Header alignment' }),
    ];
    setupStores({ configured: true, items, queryId: 'q-1' });
    useWorkItemsStore.setState({
      queryTree: [
        {
          id: 'q-1',
          name: 'All',
          path: 'All',
          isFolder: false,
          hasChildren: false,
          children: [],
        },
      ],
    });
    render(<WorkItemsSection />);
    const input = screen.getByLabelText('Filter items') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'header' } });
    expect(screen.queryByText('Quote footer broken')).toBeNull();
    expect(screen.getByText('Header alignment')).toBeInTheDocument();
  });

  // ---- Detail load on click ----

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

    fireEvent.click(screen.getByText('Item 1'));

    await waitFor(() => {
      expect(getWorkItem).toHaveBeenCalledWith(expect.anything(), 1);
    });
  });

  // ---- Persistence to ui-store ----

  it('writes the selected id to ui-store on selection', async () => {
    const { getWorkItem } = await import('@/services/ado/workitems');
    const fullItem = makeWorkItem(7);
    vi.mocked(getWorkItem).mockResolvedValue(fullItem);

    const items = [makeWorkItem(7)];
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

    fireEvent.click(screen.getByText('Item 7'));

    await waitFor(() => {
      expect(useUiStore.getState().workItemsSelectedId).toBe(7);
    });
  });

  // ---- Query browser opens as modal ----

  it('opens the query browser as a modal when "Browse all queries…" is clicked', () => {
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

    fireEvent.click(screen.getByText(/Browse all queries/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Saved Queries')).toBeInTheDocument();
  });

  it('closes the query browser modal when the backdrop is clicked', () => {
    setupStores({ configured: true });
    render(<WorkItemsSection />);
    fireEvent.click(screen.getByText(/Browse all queries/));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Click the presentation (backdrop) directly
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
