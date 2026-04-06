import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useUiStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(),
}));

vi.mock('@/services/ado/workitems', () => ({
  getWorkItems: vi.fn(() => Promise.resolve([])),
  searchWorkItemsByIdPrefix: vi.fn(() => Promise.resolve([])),
}));

describe('CommandPalette', () => {
  const onSelectWorkItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({
      isCommandPaletteOpen: false,
      setCommandPaletteOpen: vi.fn(),
    });
    useSettingsStore.setState({
      settings: {
        setupComplete: true,
        gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
        repos: [],
        ui: {
          sidebarEdge: 'right',
          sidebarMode: 'pinned',
          sidebarWidthPx: 800,
          theme: 'system',
          globalHotkey: '',
          editorCommand: 'code',
          runAtStartup: false,
          badgeStyle: 'GlassCapsule',
          indicatorStyle: 'SegmentRing',
        },
        notifications: {
          toastOnCheckStatusChange: true,
          toastOnNewPR: false,
          toastOnReviewUpdate: true,
          toastOnMergeable: true,
          onlyMyPRs: false,
          reviewNudgeEnabled: true,
          reviewNudgeIntervalMinutes: 60,
          reviewNudgeEscalation: true,
          deduplicationWindowSeconds: 60,
        },
        claudeCode: { defaultPostFixAction: 'commitAndNotify' },
        claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024 },
        claudeReview: { botUsername: 'claude[bot]' },
        updates: { autoCheckEnabled: true, autoDownload: true },
        azureDevOps: {
          organization: 'org',
          project: 'proj',
          personalAccessToken: 'pat',
          pollIntervalSeconds: 120,
          favoriteQueryIds: [],
          trackedWorkItemIds: [],
          workingOnWorkItemIds: [],
          workItemWorktreePaths: {},
          recentWorkItemIds: [],
        },
        sql: { connections: [] },
        repoPriority: {},
      },
    });
    useWorkItemsStore.setState({
      workItems: [],
      workingOnWorkItemIds: new Set(),
      currentUserDisplayName: '',
      recentWorkItemIds: [],
    });
  });

  it('returns null when not open', () => {
    useUiStore.setState({ isCommandPaletteOpen: false });
    const { container } = render(
      <CommandPalette onSelectWorkItem={onSelectWorkItem} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when open', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);
    expect(screen.getByPlaceholderText('Search work item by ID...')).toBeTruthy();
  });

  it('shows "Esc to close" text', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);
    expect(screen.getByText('Esc to close')).toBeTruthy();
  });

  it('shows empty browse message when no items', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);
    expect(screen.getByText('Type a work item ID to search')).toBeTruthy();
  });

  it('shows status hint for non-numeric search', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const input = screen.getByPlaceholderText('Search work item by ID...');
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(screen.getByText('Type a numeric ID')).toBeTruthy();
  });

  it('shows status hint for too short numeric search', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const input = screen.getByPlaceholderText('Search work item by ID...');
    fireEvent.change(input, { target: { value: '1' } });

    expect(screen.getByText('Type at least 2 digits')).toBeTruthy();
  });

  it('closes on backdrop click', () => {
    const setOpen = vi.fn();
    useUiStore.setState({ isCommandPaletteOpen: true, setCommandPaletteOpen: setOpen });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) {
      fireEvent.mouseDown(backdrop, { target: backdrop });
      expect(setOpen).toHaveBeenCalledWith(false);
    }
  });

  it('closes on Escape key', () => {
    const setOpen = vi.fn();
    useUiStore.setState({ isCommandPaletteOpen: true, setCommandPaletteOpen: setOpen });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const container = document.querySelector('.w-\\[460px\\]');
    if (container) {
      fireEvent.keyDown(container, { key: 'Escape' });
      expect(setOpen).toHaveBeenCalledWith(false);
    }
  });

  it('renders working-on section when items exist', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 123,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Test Item',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'John',
          },
        },
      ],
      workingOnWorkItemIds: new Set([123]),
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    expect(screen.getByText('Working On')).toBeTruthy();
    expect(screen.getByText('#123')).toBeTruthy();
    expect(screen.getByText('Test Item')).toBeTruthy();
  });

  it('renders assigned-to-me section', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 456,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Assigned Task',
            'System.State': 'New',
            'System.WorkItemType': 'Task',
            'System.AssignedTo': 'me@test.com',
          },
        },
      ],
      workingOnWorkItemIds: new Set(),
      currentUserDisplayName: 'me@test.com',
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    expect(screen.getByText('Assigned to Me')).toBeTruthy();
    expect(screen.getByText('#456')).toBeTruthy();
  });

  it('handles keyboard navigation with ArrowDown', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 1,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Item 1',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
        {
          id: 2,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Item 2',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([1, 2]),
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const container = document.querySelector('.w-\\[460px\\]');
    if (container) {
      fireEvent.keyDown(container, { key: 'ArrowDown' });
    }
  });

  it('selects item on Enter', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 42,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Enter Item',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([42]),
    });
    const setOpen = vi.fn();
    useUiStore.setState({ isCommandPaletteOpen: true, setCommandPaletteOpen: setOpen });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const container = document.querySelector('.w-\\[460px\\]');
    if (container) {
      fireEvent.keyDown(container, { key: 'Enter' });
      expect(onSelectWorkItem).toHaveBeenCalledWith(42);
      expect(setOpen).toHaveBeenCalledWith(false);
    }
  });

  it('selects item on mouseDown of PaletteRow', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 99,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Click Item',
            'System.State': 'Done',
            'System.WorkItemType': 'Task',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([99]),
    });
    const setOpen = vi.fn();
    useUiStore.setState({ isCommandPaletteOpen: true, setCommandPaletteOpen: setOpen });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    fireEvent.mouseDown(screen.getByText('#99'));
    expect(onSelectWorkItem).toHaveBeenCalledWith(99);
  });

  it('handles ArrowUp keyboard navigation', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 1,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Item A',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
        {
          id: 2,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Item B',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([1, 2]),
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const container = document.querySelector('.w-\\[460px\\]');
    if (container) {
      fireEvent.keyDown(container, { key: 'ArrowUp' });
    }
  });

  it('shows Recent section when recent IDs exist', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 200,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Recent Item',
            'System.State': 'Active',
            'System.WorkItemType': 'Task',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set(),
      recentWorkItemIds: [200],
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('#200')).toBeTruthy();
  });

  it('does not duplicate items across sections', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 300,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Shared Item',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([300]),
      recentWorkItemIds: [300],
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    // Should only show in "Working On", not in "Recent" as well
    expect(screen.getByText('Working On')).toBeTruthy();
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('fetches missing recent items from ADO', async () => {
    const { getWorkItems } = await import('@/services/ado/workitems');
    vi.mocked(getWorkItems).mockResolvedValue([
      {
        id: 500,
        rev: 1,
        url: '',
        fields: {
          'System.Title': 'Fetched Item',
          'System.State': 'Active',
          'System.WorkItemType': 'Task',
          'System.AssignedTo': 'dev',
        },
        relations: [],
        htmlUrl: '',
      },
    ]);

    useWorkItemsStore.setState({
      workItems: [],
      workingOnWorkItemIds: new Set(),
      recentWorkItemIds: [500],
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    await vi.waitFor(() => {
      expect(getWorkItems).toHaveBeenCalled();
    });
  });

  it('shows navigate hint when browse items exist', () => {
    useWorkItemsStore.setState({
      workItems: [
        {
          id: 1,
          rev: 1,
          url: '',
          fields: {
            'System.Title': 'Item',
            'System.State': 'Active',
            'System.WorkItemType': 'Bug',
            'System.AssignedTo': 'user',
          },
        },
      ],
      workingOnWorkItemIds: new Set([1]),
    });
    useUiStore.setState({ isCommandPaletteOpen: true });
    render(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    // Status bar should show navigation hint
    expect(screen.getByText(/navigate/)).toBeTruthy();
  });

  it('resets search state when palette closes and reopens', () => {
    useUiStore.setState({ isCommandPaletteOpen: true });
    const { rerender } = render(
      <CommandPalette onSelectWorkItem={onSelectWorkItem} />,
    );

    const input = screen.getByPlaceholderText('Search work item by ID...');
    fireEvent.change(input, { target: { value: '12' } });

    // Close
    useUiStore.setState({ isCommandPaletteOpen: false });
    rerender(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    // Reopen
    useUiStore.setState({ isCommandPaletteOpen: true });
    rerender(<CommandPalette onSelectWorkItem={onSelectWorkItem} />);

    const newInput = screen.getByPlaceholderText('Search work item by ID...');
    expect((newInput as HTMLInputElement).value).toBe('');
  });
});
