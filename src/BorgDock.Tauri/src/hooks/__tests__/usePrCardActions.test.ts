import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// --- Celebration mock ---

const mockCelebrate = vi.fn();
vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));

// --- GitHub mocks ---

const mockMergePullRequest = vi.fn().mockResolvedValue(undefined);
const mockBypassMergePullRequest = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  bypassMergePullRequest: (...args: unknown[]) => mockBypassMergePullRequest(...args),
  closePullRequest: vi.fn().mockResolvedValue(undefined),
  toggleDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: () => ({ graphql: vi.fn() }),
}));

vi.mock('@/services/github/checks', () => ({
  rerunWorkflow: vi.fn().mockResolvedValue(undefined),
}));

// --- Store mocks ---

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: Object.assign(
    (selector: (state: { show: ReturnType<typeof vi.fn> }) => unknown) =>
      selector({ show: vi.fn() }),
    { getState: () => ({ show: vi.fn() }) },
  ),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { settings: { repos: unknown[] } }) => unknown) =>
    selector({ settings: { repos: [] } }),
}));

// --- Claude actions mock ---

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    monitorPr: vi.fn().mockResolvedValue(undefined),
    resolveConflicts: vi.fn().mockResolvedValue(undefined),
  }),
}));

// --- Tauri mocks ---

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

// --- Import under test (after mocks) ---

import { usePrCardActions } from '../usePrCardActions';

// --- Fixtures ---

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Add feature X',
    headRef: 'feature/x',
    baseRef: 'main',
    authorLogin: 'alice',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/owner/repo/pull/42',
    body: '',
    repoOwner: 'owner',
    repoName: 'repo',
    reviewStatus: 'approved',
    commentCount: 0,
    labels: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 1,
    requestedReviewers: [],
    ...overrides,
  };
}

function makePrWithChecks(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: makePr(),
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

const fakeMouseEvent = { stopPropagation: () => {} } as unknown as React.MouseEvent;

// --- Tests ---

describe('usePrCardActions merge celebration', () => {
  beforeEach(() => {
    mockCelebrate.mockClear();
    mockMergePullRequest.mockClear().mockResolvedValue(undefined);
    mockBypassMergePullRequest.mockClear().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires celebrateMerge after handleMerge resolves', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.handleMerge(fakeMouseEvent);
      await Promise.resolve();
    });
    expect(mockCelebrate).toHaveBeenCalledTimes(1);
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo', title: 'Add feature X' }),
    );
  });

  it('does not fire celebrateMerge when handleMerge rejects', async () => {
    mockMergePullRequest.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.handleMerge(fakeMouseEvent);
      await Promise.resolve();
    });
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('fires celebrateMerge after executeBypassMerge resolves', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.executeBypassMerge();
      await Promise.resolve();
    });
    expect(mockCelebrate).toHaveBeenCalledTimes(1);
    expect(mockCelebrate).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo', title: 'Add feature X' }),
    );
  });

  it('does not fire celebrateMerge when executeBypassMerge rejects', async () => {
    mockBypassMergePullRequest.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.executeBypassMerge();
      await Promise.resolve();
    });
    expect(mockCelebrate).not.toHaveBeenCalled();
  });
});
