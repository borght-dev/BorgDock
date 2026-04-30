import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// --- pr-actions mocks (single source of truth for these flows now) ---

const mockMergePr = vi.fn().mockResolvedValue(true);
const mockBypassMergePr = vi.fn().mockResolvedValue(true);
const mockClosePr = vi.fn().mockResolvedValue(true);
const mockToggleDraftPr = vi.fn().mockResolvedValue(true);
const mockRerunChecks = vi.fn().mockResolvedValue(true);
const mockCheckoutPrBranch = vi.fn().mockResolvedValue(true);
const mockOpenPrInBrowser = vi.fn().mockResolvedValue(true);

vi.mock('@/services/pr-actions', () => ({
  mergePr: (...args: unknown[]) => mockMergePr(...args),
  bypassMergePr: (...args: unknown[]) => mockBypassMergePr(...args),
  closePr: (...args: unknown[]) => mockClosePr(...args),
  toggleDraftPr: (...args: unknown[]) => mockToggleDraftPr(...args),
  rerunChecks: (...args: unknown[]) => mockRerunChecks(...args),
  checkoutPrBranch: (...args: unknown[]) => mockCheckoutPrBranch(...args),
  openPrInBrowser: (...args: unknown[]) => mockOpenPrInBrowser(...args),
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

// --- Clipboard / opener mocks (still used directly for "copy branch" UX) ---

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

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

const fakeMouseEvent = { stopPropagation: () => {}, preventDefault: () => {} } as unknown as React.MouseEvent;

// --- Tests ---

describe('usePrCardActions', () => {
  beforeEach(() => {
    mockMergePr.mockClear().mockResolvedValue(true);
    mockBypassMergePr.mockClear().mockResolvedValue(true);
    mockClosePr.mockClear().mockResolvedValue(true);
    mockToggleDraftPr.mockClear().mockResolvedValue(true);
    mockCheckoutPrBranch.mockClear().mockResolvedValue(true);
    mockRerunChecks.mockClear().mockResolvedValue(true);
    mockOpenPrInBrowser.mockClear().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handleMerge dispatches mergePr with the PR ref', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.handleMerge(fakeMouseEvent);
      await Promise.resolve();
    });
    expect(mockMergePr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo', title: 'Add feature X' }),
    );
  });

  it('executeBypassMerge dispatches bypassMergePr', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.executeBypassMerge();
      await Promise.resolve();
    });
    expect(mockBypassMergePr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
    );
  });

  it('executeClose dispatches closePr', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.executeClose();
      await Promise.resolve();
    });
    expect(mockClosePr).toHaveBeenCalledWith({ repoOwner: 'owner', repoName: 'repo', number: 42 });
  });

  it('executeToggleDraft dispatches toggleDraftPr with the current isDraft', async () => {
    const { result } = renderHook(() =>
      usePrCardActions(makePrWithChecks({ pullRequest: makePr({ isDraft: true }) })),
    );
    await act(async () => {
      result.current.executeToggleDraft();
      await Promise.resolve();
    });
    expect(mockToggleDraftPr).toHaveBeenCalledWith(
      expect.objectContaining({ isDraft: true, number: 42 }),
    );
  });

  it('handleCheckout dispatches checkoutPrBranch with notifyOnSuccess', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.handleCheckout(fakeMouseEvent);
      await Promise.resolve();
    });
    expect(mockCheckoutPrBranch).toHaveBeenCalledWith(
      { repoOwner: 'owner', repoName: 'repo', headRef: 'feature/x' },
      { notifyOnSuccess: true },
    );
  });

  it('handleOpenInBrowser dispatches openPrInBrowser', async () => {
    const { result } = renderHook(() => usePrCardActions(makePrWithChecks()));
    await act(async () => {
      result.current.handleOpenInBrowser(fakeMouseEvent);
      await Promise.resolve();
    });
    expect(mockOpenPrInBrowser).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42');
  });
});
