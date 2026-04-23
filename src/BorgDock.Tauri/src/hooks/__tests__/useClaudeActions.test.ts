import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks, RepoSettings } from '@/types';

const mockInvoke = vi.fn();
const mockBuildFixPrompt = vi.fn();
const mockBuildConflictPrompt = vi.fn();
const mockBuildMonitorPrompt = vi.fn();
const mockLaunchClaude = vi.fn();
const mockWritePromptFile = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/services/claude-launcher', () => ({
  buildFixPrompt: (...args: unknown[]) => mockBuildFixPrompt(...args),
  buildConflictPrompt: (...args: unknown[]) => mockBuildConflictPrompt(...args),
  buildMonitorPrompt: (...args: unknown[]) => mockBuildMonitorPrompt(...args),
  launchClaude: (...args: unknown[]) => mockLaunchClaude(...args),
  writePromptFile: (...args: unknown[]) => mockWritePromptFile(...args),
}));

const repoSettings: RepoSettings = {
  owner: 'test',
  name: 'repo',
  enabled: true,
  worktreeBasePath: '/path/to/repo',
  worktreeSubfolder: '.worktrees',
};

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      settings: {
        repos: [repoSettings],
      },
    }),
}));

import { useClaudeActions } from '../useClaudeActions';

function makePr(
  overrides: Partial<{
    number: number;
    repoOwner: string;
    repoName: string;
    headRef: string;
  }> = {},
): PullRequestWithChecks {
  return {
    pullRequest: {
      number: overrides.number ?? 1,
      title: 'Test PR',
      headRef: overrides.headRef ?? 'feature-branch',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/test/repo/pull/1',
      body: '',
      repoOwner: overrides.repoOwner ?? 'test',
      repoName: overrides.repoName ?? 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'red',
    failedCheckNames: ['build'],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

describe('useClaudeActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWritePromptFile.mockResolvedValue('/tmp/prompt.md');
    mockLaunchClaude.mockResolvedValue(undefined);
    mockBuildFixPrompt.mockReturnValue('fix prompt');
    mockBuildConflictPrompt.mockReturnValue('conflict prompt');
    mockBuildMonitorPrompt.mockReturnValue('monitor prompt');
  });

  describe('fixWithClaude', () => {
    it('creates worktree, writes prompt, and launches claude', async () => {
      mockInvoke
        .mockResolvedValueOnce([
          { path: '/worktree/feature-branch', branchName: 'feature-branch', isMainWorktree: false },
        ])
        .mockResolvedValueOnce('/worktree/feature-branch');

      const { result } = renderHook(() => useClaudeActions());

      await result.current.fixWithClaude(
        makePr(),
        ['build'],
        [
          {
            filePath: 'src/app.ts',
            message: 'error',
            errorCode: 'TS001',
            category: 'error',
            isIntroducedByPr: true,
          },
        ],
        ['src/app.ts'],
        'raw log text',
      );

      expect(mockInvoke).toHaveBeenCalledWith('list_worktrees_bare', { basePath: '/path/to/repo' });
      expect(mockBuildFixPrompt).toHaveBeenCalled();
      expect(mockWritePromptFile).toHaveBeenCalledWith('fix prompt');
      expect(mockLaunchClaude).toHaveBeenCalledWith(
        '/worktree/feature-branch',
        '/tmp/prompt.md',
        'Fix build',
      );
    });

    it('creates a new worktree when none exists for the branch', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // no existing worktrees
        .mockResolvedValueOnce('/worktree/new-branch');

      const { result } = renderHook(() => useClaudeActions());

      await result.current.fixWithClaude(makePr({ headRef: 'new-branch' }), ['lint'], [], [], '');

      expect(mockInvoke).toHaveBeenCalledWith('create_worktree', {
        basePath: '/path/to/repo',
        subfolder: '.worktrees',
        branchName: 'new-branch',
      });
    });

    it('throws when repo not found in settings', async () => {
      const { result } = renderHook(() => useClaudeActions());

      await expect(
        result.current.fixWithClaude(
          makePr({ repoOwner: 'unknown', repoName: 'unknown' }),
          ['build'],
          [],
          [],
          '',
        ),
      ).rejects.toThrow('not found in settings');
    });

    it('throws when no worktreeBasePath configured', async () => {
      // Override the settings to have a repo without worktreeBasePath
      const origRepos = repoSettings.worktreeBasePath;
      repoSettings.worktreeBasePath = '';

      const { result } = renderHook(() => useClaudeActions());

      await expect(result.current.fixWithClaude(makePr(), ['build'], [], [], '')).rejects.toThrow(
        'No worktree base path',
      );

      repoSettings.worktreeBasePath = origRepos;
    });

    it('uses correct label for multiple failing checks', async () => {
      mockInvoke.mockResolvedValueOnce([
        { path: '/worktree/feature-branch', branchName: 'feature-branch', isMainWorktree: false },
      ]);

      const { result } = renderHook(() => useClaudeActions());

      await result.current.fixWithClaude(makePr(), ['build', 'lint', 'test'], [], [], '');

      expect(mockLaunchClaude).toHaveBeenCalledWith(
        '/worktree/feature-branch',
        '/tmp/prompt.md',
        'Fix 3 failing checks',
      );
    });
  });

  describe('resolveConflicts', () => {
    it('creates worktree and launches claude with conflict prompt', async () => {
      mockInvoke.mockResolvedValueOnce([
        { path: '/worktree/feature-branch', branchName: 'feature-branch', isMainWorktree: false },
      ]);

      const { result } = renderHook(() => useClaudeActions());
      const pr = makePr();

      await result.current.resolveConflicts(pr);

      expect(mockBuildConflictPrompt).toHaveBeenCalledWith(pr);
      expect(mockLaunchClaude).toHaveBeenCalledWith(
        '/worktree/feature-branch',
        '/tmp/prompt.md',
        'Resolve merge conflicts',
      );
    });
  });

  describe('monitorPr', () => {
    it('creates worktree and launches claude with monitor prompt', async () => {
      mockInvoke.mockResolvedValueOnce([
        { path: '/worktree/feature-branch', branchName: 'feature-branch', isMainWorktree: false },
      ]);

      const { result } = renderHook(() => useClaudeActions());
      const pr = makePr();

      await result.current.monitorPr(pr);

      expect(mockBuildMonitorPrompt).toHaveBeenCalledWith(pr, repoSettings);
      expect(mockLaunchClaude).toHaveBeenCalledWith(
        '/worktree/feature-branch',
        '/tmp/prompt.md',
        'Monitor PR #1',
      );
    });

    it('throws when repo not found in settings', async () => {
      const { result } = renderHook(() => useClaudeActions());

      await expect(
        result.current.monitorPr(makePr({ repoOwner: 'unknown', repoName: 'unknown' })),
      ).rejects.toThrow('not found in settings');
    });
  });

  describe('worktree reuse', () => {
    it('reuses existing worktree with refs/heads/ prefix', async () => {
      mockInvoke.mockResolvedValueOnce([
        {
          path: '/worktree/feature-branch',
          branchName: 'refs/heads/feature-branch',
          isMainWorktree: false,
        },
      ]);

      const { result } = renderHook(() => useClaudeActions());
      await result.current.resolveConflicts(makePr());

      // Should not call create_worktree
      expect(mockInvoke).not.toHaveBeenCalledWith('create_worktree', expect.anything());
      expect(mockLaunchClaude).toHaveBeenCalledWith(
        '/worktree/feature-branch',
        expect.any(String),
        expect.any(String),
      );
    });
  });
});
