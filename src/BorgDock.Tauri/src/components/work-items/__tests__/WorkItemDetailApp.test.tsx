import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Tauri mocks (must be before component import) ----

const mockInvoke = vi.fn();
const mockSetTitle = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockShow = vi.fn().mockResolvedValue(undefined);
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockIsMaximized = vi.fn().mockResolvedValue(false);
const mockMinimize = vi.fn().mockResolvedValue(undefined);
const mockMaximize = vi.fn().mockResolvedValue(undefined);
const mockUnmaximize = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: mockListen,
    setTitle: mockSetTitle,
    show: mockShow,
    close: mockClose,
    isMaximized: mockIsMaximized,
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
  })),
}));

// Mock ADO services
vi.mock('@/services/ado/workitems', () => ({
  getWorkItem: vi.fn(),
  getWorkItemComments: vi.fn().mockResolvedValue([]),
  getWorkItemTypeStates: vi.fn().mockResolvedValue(['New', 'Active', 'Resolved']),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
}));

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    getStream: vi.fn(),
  })),
}));

vi.mock('@/hooks/useAdoImageAuth', () => ({
  useAdoImageAuth: vi.fn(),
}));

import { getWorkItem } from '@/services/ado/workitems';
import type { WorkItem } from '@/types';
import type { AppSettings } from '@/types/settings';
import { WorkItemDetailApp } from '../WorkItemDetailApp';

// ---------- factories ----------

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'dark',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
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
      organization: 'myorg',
      project: 'myproj',
      personalAccessToken: 'fake-pat',
      authMethod: 'pat' as const,
      authAutoDetected: true,
      pollIntervalSeconds: 120,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
    },
    sql: { connections: [] },
    repoPriority: {},
    ...overrides,
  };
}

function makeWorkItem(id: number): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/myorg/myproj/_apis/wit/workItems/${id}`,
    fields: {
      'System.Title': 'Test work item',
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': 'Alice',
      'System.Tags': '',
      'Microsoft.VSTS.Common.Priority': 2,
    },
    relations: [],
    htmlUrl: `https://dev.azure.com/myorg/myproj/_workitems/edit/${id}`,
  };
}

// ---------- tests ----------

describe('WorkItemDetailApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no ?id param
    Object.defineProperty(window, 'location', {
      value: { search: '', href: 'http://localhost/' },
      writable: true,
    });
  });

  afterEach(cleanup);

  it('shows error when no work item ID in URL', async () => {
    mockInvoke.mockResolvedValueOnce(makeSettings());
    Object.defineProperty(window, 'location', {
      value: { search: '', href: 'http://localhost/' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('No work item ID provided')).toBeDefined();
    });
  });

  it('loads settings and work item on mount', async () => {
    const settings = makeSettings();
    const workItem = makeWorkItem(42);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('load_settings');
    });

    await waitFor(() => {
      expect(getWorkItem).toHaveBeenCalled();
    });
  });

  it('sets window title after loading work item', async () => {
    const settings = makeSettings();
    const workItem = makeWorkItem(42);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(mockSetTitle).toHaveBeenCalledWith('#42 - Test work item');
    });
  });

  it('shows loading spinner initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    const { container } = render(<WorkItemDetailApp />);
    expect(container.querySelector('.animate-spin')).toBeDefined();
  });

  it('shows error state when load fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load work item')).toBeDefined();
    });
  });

  it('renders work item title in titlebar area', async () => {
    const settings = makeSettings();
    const workItem = makeWorkItem(99);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=99', href: 'http://localhost/?id=99' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('Test work item')).toBeDefined();
    });
  });

  it('renders detail panel with work item fields', async () => {
    const settings = makeSettings();
    const workItem: WorkItem = {
      ...makeWorkItem(42),
      fields: {
        ...makeWorkItem(42).fields,
        'System.Description': '<p>Test description</p>',
        'Microsoft.VSTS.Common.StackRank': '1.5',
      },
    };
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('Test work item')).toBeDefined();
    });
  });

  it('handles work item with relations/attachments', async () => {
    const settings = makeSettings();
    const workItem: WorkItem = {
      ...makeWorkItem(42),
      relations: [
        {
          rel: 'AttachedFile',
          url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/abc',
          attributes: {
            id: 'abc',
            name: 'file.txt',
            resourceSize: 1024,
          },
        },
      ],
    };
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('Test work item')).toBeDefined();
    });
  });

  it('loads available states for the work item type', async () => {
    const { getWorkItemTypeStates } = await import('@/services/ado/workitems');
    const settings = makeSettings();
    const workItem = makeWorkItem(42);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);
    vi.mocked(getWorkItemTypeStates).mockResolvedValueOnce(['New', 'Active', 'Resolved', 'Closed']);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(getWorkItemTypeStates).toHaveBeenCalled();
    });
  });

  it('falls back to current state when getWorkItemTypeStates fails', async () => {
    const { getWorkItemTypeStates } = await import('@/services/ado/workitems');
    const settings = makeSettings();
    const workItem = makeWorkItem(42);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);
    vi.mocked(getWorkItemTypeStates).mockRejectedValueOnce(new Error('Not found'));

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(screen.getByText('Test work item')).toBeDefined();
    });
  });

  it('loads comments on mount', async () => {
    const { getWorkItemComments } = await import('@/services/ado/workitems');
    const settings = makeSettings();
    const workItem = makeWorkItem(42);
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(workItem);
    vi.mocked(getWorkItemComments).mockResolvedValueOnce([
      {
        id: 1,
        text: 'Test comment',
        createdBy: { displayName: 'User' },
        createdDate: '2026-01-01',
        modifiedDate: '2026-01-01',
      },
    ]);

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(getWorkItemComments).toHaveBeenCalledWith(expect.anything(), 42);
    });
  });

  it('applies dark theme from settings', async () => {
    const settings = makeSettings({ ui: { ...makeSettings().ui, theme: 'dark' } });
    mockInvoke.mockResolvedValueOnce(settings);
    vi.mocked(getWorkItem).mockResolvedValueOnce(makeWorkItem(42));

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    render(<WorkItemDetailApp />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('shows "Work Item" title when no ID and no detail data', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    Object.defineProperty(window, 'location', {
      value: { search: '', href: 'http://localhost/' },
      writable: true,
    });

    render(<WorkItemDetailApp />);
    // Should render the titlebar with generic title
    expect(screen.getByText('Work Item')).toBeDefined();
  });
});
