import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (must be hoisted by vi.mock) ---

const mockMergePullRequest = vi.fn();
const mockBypassMergePullRequest = vi.fn();
const mockClosePullRequest = vi.fn();
const mockToggleDraft = vi.fn();
const mockRerunWorkflow = vi.fn();
const mockOpenUrl = vi.fn();
const mockInvoke = vi.fn();
const mockCelebrate = vi.fn();
const mockShow = vi.fn();
const mockRefreshPr = vi.fn();

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
  bypassMergePullRequest: (...args: unknown[]) => mockBypassMergePullRequest(...args),
  closePullRequest: (...args: unknown[]) => mockClosePullRequest(...args),
  toggleDraft: (...args: unknown[]) => mockToggleDraft(...args),
}));

vi.mock('@/services/github/checks', () => ({
  rerunWorkflow: (...args: unknown[]) => mockRerunWorkflow(...args),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: () => ({ id: 'mock-client' }),
}));

vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: { getState: () => ({ show: mockShow }) },
}));

vi.mock('@/stores/pr-store', () => ({
  usePrStore: { getState: () => ({ refreshPr: mockRefreshPr }) },
}));

let mockRepos: Array<{ owner: string; name: string; worktreeBasePath: string }> = [];
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: { repos: mockRepos } }) },
}));

// --- Imports under test ---

import {
  bypassMergePr,
  checkoutPrBranch,
  closePr,
  mergePr,
  openPrInBrowser,
  rerunChecks,
  toggleDraftPr,
} from '../pr-actions';

const samplePr = {
  repoOwner: 'owner',
  repoName: 'repo',
  number: 42,
  title: 'Add feature X',
  htmlUrl: 'https://github.com/owner/repo/pull/42',
};

beforeEach(() => {
  vi.useFakeTimers();
  mockMergePullRequest.mockReset().mockResolvedValue(undefined);
  mockBypassMergePullRequest.mockReset().mockResolvedValue(undefined);
  mockClosePullRequest.mockReset().mockResolvedValue(undefined);
  mockToggleDraft.mockReset().mockResolvedValue(undefined);
  mockRerunWorkflow.mockReset().mockResolvedValue(undefined);
  mockOpenUrl.mockReset().mockResolvedValue(undefined);
  mockInvoke.mockReset().mockResolvedValue(undefined);
  mockCelebrate.mockReset();
  mockShow.mockReset();
  mockRefreshPr.mockReset();
  mockRepos = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mergePr', () => {
  it('merges, celebrates, and schedules a deferred refresh', async () => {
    expect(await mergePr(samplePr)).toBe(true);
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.anything(),
      'owner',
      'repo',
      42,
      undefined,
    );
    expect(mockCelebrate).toHaveBeenCalledWith(samplePr);
    expect(mockRefreshPr).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalledWith('owner', 'repo', 42);
  });

  it('passes through an explicit method without auto-detection', async () => {
    await mergePr(samplePr, { method: 'squash' });
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.anything(),
      'owner',
      'repo',
      42,
      'squash',
    );
  });

  it('reports failure and returns false on a rejected mutation', async () => {
    mockMergePullRequest.mockRejectedValueOnce(new Error('405'));
    expect(await mergePr(samplePr)).toBe(false);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Merge failed', severity: 'error' }),
    );
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('routes errors through onError when provided', async () => {
    mockMergePullRequest.mockRejectedValueOnce(new Error('boom'));
    const onError = vi.fn();
    await mergePr(samplePr, { onError });
    expect(onError).toHaveBeenCalledWith('Merge failed', expect.any(Error));
    expect(mockShow).not.toHaveBeenCalled();
  });
});

describe('bypassMergePr', () => {
  it('celebrates and schedules a refresh on success', async () => {
    expect(await bypassMergePr(samplePr)).toBe(true);
    expect(mockBypassMergePullRequest).toHaveBeenCalledWith('owner', 'repo', 42);
    expect(mockCelebrate).toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalled();
  });
});

describe('closePr', () => {
  it('closes and schedules a refresh, no celebration', async () => {
    expect(await closePr({ repoOwner: 'owner', repoName: 'repo', number: 42 })).toBe(true);
    expect(mockCelebrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(mockRefreshPr).toHaveBeenCalled();
  });
});

describe('toggleDraftPr', () => {
  it('flips the draft flag and refreshes immediately (no delay)', async () => {
    await toggleDraftPr({ repoOwner: 'owner', repoName: 'repo', number: 42, isDraft: false });
    expect(mockToggleDraft).toHaveBeenCalledWith(expect.anything(), 'owner', 'repo', 42, true);
    expect(mockRefreshPr).toHaveBeenCalled(); // synchronous, not setTimeout
  });

  it('uses a "ready" error title when toggling out of draft state fails', async () => {
    mockToggleDraft.mockRejectedValueOnce(new Error('x'));
    await toggleDraftPr({ repoOwner: 'owner', repoName: 'repo', number: 42, isDraft: true });
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mark ready failed' }),
    );
  });
});

describe('rerunChecks', () => {
  it('forwards the check-suite ID', async () => {
    await rerunChecks({ repoOwner: 'owner', repoName: 'repo', checkSuiteId: 99 });
    expect(mockRerunWorkflow).toHaveBeenCalledWith(expect.anything(), 'owner', 'repo', 99);
  });
});

describe('checkoutPrBranch', () => {
  it('looks up the repo (case-insensitive) and runs fetch + checkout', async () => {
    mockRepos = [{ owner: 'OWNER', name: 'Repo', worktreeBasePath: '/code/repo' }];
    expect(
      await checkoutPrBranch({ repoOwner: 'owner', repoName: 'repo', headRef: 'feature/x' }),
    ).toBe(true);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'git_fetch', {
      repoPath: '/code/repo',
      remote: 'origin',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'git_checkout', {
      repoPath: '/code/repo',
      branch: 'feature/x',
    });
  });

  it('reports an error and returns false when the repo has no worktree base path', async () => {
    mockRepos = [{ owner: 'owner', name: 'repo', worktreeBasePath: '' }];
    expect(
      await checkoutPrBranch({ repoOwner: 'owner', repoName: 'repo', headRef: 'x' }),
    ).toBe(false);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Checkout failed' }),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('fires a success toast when notifyOnSuccess is set', async () => {
    mockRepos = [{ owner: 'owner', name: 'repo', worktreeBasePath: '/path' }];
    await checkoutPrBranch(
      { repoOwner: 'owner', repoName: 'repo', headRef: 'feature/x' },
      { notifyOnSuccess: true },
    );
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Checked out', severity: 'success' }),
    );
  });
});

describe('openPrInBrowser', () => {
  it('forwards to openUrl and reports failure', async () => {
    await openPrInBrowser('https://example/pr/1');
    expect(mockOpenUrl).toHaveBeenCalledWith('https://example/pr/1');

    mockOpenUrl.mockRejectedValueOnce(new Error('no'));
    expect(await openPrInBrowser('https://example/pr/2')).toBe(false);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to open URL' }),
    );
  });
});
