import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest } from '@/types';

const mockInvoke = vi.fn();
const mockNotify = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/services/notification', () => ({
  sendOsNotification: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        repos: [
          {
            owner: 'test',
            name: 'repo',
            enabled: true,
            worktreeBasePath: '/code/repo',
            worktreeSubfolder: '.worktrees',
          },
        ],
        agents: {
          defaultProvider: 'claude',
          defaultPostFixAction: 'commitAndNotify',
          t3Model: 'claude-fable-5',
          t3ModelInstance: 'claudeAgent',
          t3Path: 'C:/t3/T3.exe',
        },
      },
    }),
  },
}));

import { useT3ThreadStore } from '@/stores/t3-thread-store';
import { openT3Thread, requestT3Thread } from '../t3-thread';

const pr: PullRequest = {
  number: 42,
  title: 'Add thing',
  headRef: 'feat/thing',
  baseRef: 'main',
  authorLogin: 'me',
  authorAvatarUrl: '',
  state: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isDraft: false,
  htmlUrl: 'https://github.com/test/repo/pull/42',
  body: '',
  repoOwner: 'test',
  repoName: 'repo',
  reviewStatus: 'none',
  commentCount: 0,
  labels: [],
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  requestedReviewers: [],
};

describe('t3-thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useT3ThreadStore.getState().setPendingCheckout(null);
  });

  it('opens the thread directly when the branch is already in a worktree', async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { path: '/code/repo', branchName: 'main', isMainWorktree: true },
        {
          path: '/code/repo/.worktrees/feat-thing',
          branchName: 'feat/thing',
          isMainWorktree: false,
        },
      ])
      .mockResolvedValueOnce({ tier: 2, threadId: 'abc' });

    await requestT3Thread(pr);

    expect(mockInvoke).toHaveBeenCalledWith('list_worktrees_bare', { basePath: '/code/repo' });
    expect(mockInvoke).toHaveBeenCalledWith('t3_open_thread', {
      workspaceRoot: '/code/repo/.worktrees/feat-thing',
      branch: 'feat/thing',
      title: 'PR #42: Add thing',
      repository: 'test/repo',
      prNumber: 42,
      prUrl: 'https://github.com/test/repo/pull/42',
      model: 'claude-fable-5',
      modelInstance: 'claudeAgent',
      executable: 'C:/t3/T3.exe',
    });
    expect(useT3ThreadStore.getState().pendingCheckout).toBeNull();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('hands the PR to the worktree picker when no worktree has the branch', async () => {
    mockInvoke.mockResolvedValueOnce([
      { path: '/code/repo', branchName: 'main', isMainWorktree: true },
      { path: '/code/repo/.worktrees/other', branchName: 'other', isMainWorktree: false },
    ]);

    await requestT3Thread(pr);

    expect(mockInvoke).not.toHaveBeenCalledWith('t3_open_thread', expect.anything());
    expect(useT3ThreadStore.getState().pendingCheckout).toEqual(pr);
  });

  it('ignores the main worktree even when it is on the PR branch', async () => {
    mockInvoke.mockResolvedValueOnce([
      { path: '/code/repo', branchName: 'feat/thing', isMainWorktree: true },
    ]);

    await requestT3Thread(pr);

    expect(useT3ThreadStore.getState().pendingCheckout).toEqual(pr);
  });

  it('throws when the repo has no worktree base path', async () => {
    await expect(requestT3Thread({ ...pr, repoOwner: 'other', repoName: 'x' })).rejects.toThrow(
      'No worktree base path',
    );
  });

  it('tells the user to pair when T3 was only activated', async () => {
    mockInvoke.mockResolvedValueOnce({ tier: 1 });

    await openT3Thread(pr, '/code/repo/.worktrees/feat-thing');

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', title: expect.stringContaining('without') }),
    );
  });
});
