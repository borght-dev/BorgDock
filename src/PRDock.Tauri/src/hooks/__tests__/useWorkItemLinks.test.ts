import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, WorkItem } from '@/types';

// Mock ADO client
const mockGetWorkItems = vi.fn();

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/services/ado/workitems', () => ({
  getWorkItems: (...args: unknown[]) => mockGetWorkItems(...args),
}));

// Mock work item linker
const mockDetectWorkItemIds = vi.fn();

vi.mock('@/services/work-item-linker', () => ({
  detectWorkItemIds: (...args: unknown[]) => mockDetectWorkItemIds(...args),
}));

// Use real stores
import { useLinkStore } from '@/stores/link-store';
import { useSettingsStore } from '@/stores/settings-store';

import { useWorkItemLinks } from '../useWorkItemLinks';

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR AB#123',
    headRef: 'feature-branch',
    baseRef: 'main',
    authorLogin: 'testuser',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/test/repo/pull/1',
    body: '',
    repoOwner: 'test',
    repoName: 'repo',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commitCount: 1,
    requestedReviewers: [],
    ...overrides,
  };
}

function makeWorkItem(id: number, title: string = 'Work Item'): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/org/project/_apis/wit/workitems/${id}`,
    fields: {
      'System.Title': title,
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
    },
  };
}

describe('useWorkItemLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset link store cache
    useLinkStore.setState({ cache: new Map() });
    mockDetectWorkItemIds.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty state when pr is null', () => {
    const { result } = renderHook(() => useWorkItemLinks(null));

    expect(result.current.workItemIds).toEqual([]);
    expect(result.current.workItems).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('detects work item IDs from the PR', () => {
    mockDetectWorkItemIds.mockReturnValue([123, 456]);

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    expect(result.current.workItemIds).toEqual([123, 456]);
    expect(mockDetectWorkItemIds).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }));
  });

  it('fetches missing work items from ADO', async () => {
    mockDetectWorkItemIds.mockReturnValue([123]);
    mockGetWorkItems.mockResolvedValue([makeWorkItem(123, 'My Work Item')]);

    // Ensure ADO settings are configured
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...settings,
      azureDevOps: {
        ...settings.azureDevOps,
        organization: 'test-org',
        project: 'test-project',
        personalAccessToken: 'test-pat',
      },
    });

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    await vi.waitFor(() => {
      expect(mockGetWorkItems).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // After fetch, the work item should be in the link store
    expect(useLinkStore.getState().getWorkItem(123)).toBeDefined();
  });

  it('does not fetch when ADO is not configured', async () => {
    mockDetectWorkItemIds.mockReturnValue([123]);

    // Ensure ADO settings are NOT configured
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...settings,
      azureDevOps: {
        ...settings.azureDevOps,
        organization: '',
        project: '',
        personalAccessToken: undefined,
      },
    });

    renderHook(() => useWorkItemLinks(makePr()));

    // Wait a tick to ensure any async operations would have started
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetWorkItems).not.toHaveBeenCalled();
  });

  it('does not fetch when IDs are already fresh in cache', async () => {
    mockDetectWorkItemIds.mockReturnValue([123]);

    // Pre-populate the link store with a fresh entry
    useLinkStore.getState().setWorkItem(123, makeWorkItem(123, 'Cached Item'));

    const settings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...settings,
      azureDevOps: {
        ...settings.azureDevOps,
        organization: 'test-org',
        project: 'test-project',
        personalAccessToken: 'test-pat',
      },
    });

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    // Wait a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetWorkItems).not.toHaveBeenCalled();
    expect(result.current.workItems).toHaveLength(1);
    expect(result.current.workItems[0]!.id).toBe(123);
  });

  it('returns cached work items', () => {
    mockDetectWorkItemIds.mockReturnValue([123, 456]);

    // Pre-populate cache
    useLinkStore.getState().setWorkItem(123, makeWorkItem(123, 'Item 123'));
    useLinkStore.getState().setWorkItem(456, makeWorkItem(456, 'Item 456'));

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    expect(result.current.workItems).toHaveLength(2);
    expect(result.current.workItems[0]!.id).toBe(123);
    expect(result.current.workItems[1]!.id).toBe(456);
  });

  it('handles fetch errors gracefully', async () => {
    mockDetectWorkItemIds.mockReturnValue([999]);
    mockGetWorkItems.mockRejectedValue(new Error('network error'));

    const settings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...settings,
      azureDevOps: {
        ...settings.azureDevOps,
        organization: 'test-org',
        project: 'test-project',
        personalAccessToken: 'test-pat',
      },
    });

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    await vi.waitFor(() => {
      expect(mockGetWorkItems).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should not crash, just no work items
    expect(result.current.workItems).toHaveLength(0);
  });

  it('does not fetch when there are no detected IDs', async () => {
    mockDetectWorkItemIds.mockReturnValue([]);

    const settings = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...settings,
      azureDevOps: {
        ...settings.azureDevOps,
        organization: 'test-org',
        project: 'test-project',
        personalAccessToken: 'test-pat',
      },
    });

    renderHook(() => useWorkItemLinks(makePr()));

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetWorkItems).not.toHaveBeenCalled();
  });

  it('filters out undefined work items from result', () => {
    mockDetectWorkItemIds.mockReturnValue([123, 456, 789]);

    // Only cache 123 and 789, not 456
    useLinkStore.getState().setWorkItem(123, makeWorkItem(123));
    useLinkStore.getState().setWorkItem(789, makeWorkItem(789));

    const { result } = renderHook(() => useWorkItemLinks(makePr()));

    expect(result.current.workItems).toHaveLength(2);
    expect(result.current.workItems.map((w) => w.id)).toEqual([123, 789]);
  });
});
