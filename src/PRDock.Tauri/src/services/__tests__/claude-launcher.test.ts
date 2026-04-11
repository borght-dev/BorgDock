import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedError, PullRequestWithChecks, RepoSettings } from '@/types';
import { buildConflictPrompt, buildFixPrompt, buildMonitorPrompt } from '../claude-launcher';

function makePrWithChecks(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Fix login flow',
      headRef: 'fix/login',
      baseRef: 'main',
      authorLogin: 'alice',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/owner/repo/pull/42',
      body: '',
      repoOwner: 'owner',
      repoName: 'repo',
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
    ...overrides,
  };
}

function makeRepoSettings(overrides: Partial<RepoSettings> = {}): RepoSettings {
  return {
    owner: 'owner',
    name: 'repo',
    enabled: true,
    worktreeBasePath: '/tmp/worktrees',
    worktreeSubfolder: '',
    ...overrides,
  };
}

function makeErrors(): ParsedError[] {
  return [
    {
      filePath: 'src/auth.ts',
      lineNumber: 42,
      message: 'Property does not exist on type',
      errorCode: 'TS2339',
      category: 'typescript',
      isIntroducedByPr: true,
    },
    {
      filePath: 'src/utils.ts',
      lineNumber: undefined,
      message: 'Missing semicolon',
      errorCode: 'lint/semi',
      category: 'eslint',
      isIntroducedByPr: false,
    },
  ];
}

describe('buildFixPrompt', () => {
  it('includes the check name in the title for single check', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['ci/build'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('# Fix Failing Check: ci/build');
  });

  it('includes all check names in the title for multiple checks', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['ci/build', 'ci/test'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('# Fix Failing Checks: 2 checks');
    expect(prompt).toContain('ci/build, ci/test');
  });

  it('includes PR number and title', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('#42 Fix login flow');
  });

  it('includes branch names', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('fix/login');
    expect(prompt).toContain('main');
    expect(prompt).toMatch(/fix\/login.*→.*main/);
  });

  it('includes parsed errors with file paths and line numbers', () => {
    const errors = makeErrors();
    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], errors, [], '', makeRepoSettings());

    expect(prompt).toContain('src/auth.ts:42');
    expect(prompt).toContain('Property does not exist on type');
    expect(prompt).toContain('(TS2339)');
    expect(prompt).toContain('src/utils.ts');
    expect(prompt).toContain('Missing semicolon');
    expect(prompt).toContain('(lint/semi)');
  });

  it('includes changed file list', () => {
    const changedFiles = ['src/auth.ts', 'src/components/Login.tsx'];
    const prompt = buildFixPrompt(
      makePrWithChecks(),
      ['build'],
      [],
      changedFiles,
      '',
      makeRepoSettings(),
    );

    expect(prompt).toContain('## Changed Files in This PR');
    expect(prompt).toContain('- src/auth.ts');
    expect(prompt).toContain('- src/components/Login.tsx');
  });

  it('truncates raw log to last 200 lines', () => {
    const logLines = Array.from({ length: 300 }, (_, i) => `log line ${i + 1}`);
    const rawLog = logLines.join('\n');

    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], rawLog, makeRepoSettings());

    expect(prompt).toContain('## Raw Log (last 200 lines)');
    expect(prompt).toContain('log line 101');
    expect(prompt).toContain('log line 300');
    expect(prompt).not.toContain('log line 100\n');
  });

  it('includes custom template when provided', () => {
    const repoSettings = makeRepoSettings({
      fixPromptTemplate: 'Always run `npm test` after making changes.',
    });

    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], '', repoSettings);

    expect(prompt).toContain('## Additional Instructions');
    expect(prompt).toContain('Always run `npm test` after making changes.');
  });

  it('includes task instructions with single check', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('## Task');
    expect(prompt).toContain('Fix the failing check (build)');
    expect(prompt).toContain(
      'Focus only on errors that are relevant to the files changed in this PR',
    );
  });

  it('includes task instructions with multiple checks', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['build', 'test'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('## Task');
    expect(prompt).toContain('Fix the failing checks (build, test)');
  });

  it('includes commit, push and monitoring instructions', () => {
    const prompt = buildFixPrompt(makePrWithChecks(), ['build'], [], [], '', makeRepoSettings());

    expect(prompt).toContain('## After Fixing: Commit, Push & Monitor');
    expect(prompt).toContain('git commit');
    expect(prompt).toContain('git push');
    expect(prompt).toContain('gh pr checks 42');
    expect(prompt).toContain('Maximum 5 fix-and-push cycles');
  });
});

describe('buildConflictPrompt', () => {
  it('includes PR context (number, title, branches)', () => {
    const prompt = buildConflictPrompt(makePrWithChecks());

    expect(prompt).toContain('#42 Fix login flow');
    expect(prompt).toContain('fix/login');
    expect(prompt).toContain('main');
  });

  it('includes conflict resolution instructions', () => {
    const prompt = buildConflictPrompt(makePrWithChecks());

    expect(prompt).toContain('Resolve Merge Conflicts');
    expect(prompt).toContain('Resolve any merge conflicts');
    expect(prompt).toContain('Commit the merge resolution');
  });

  it('mentions the base branch', () => {
    const prompt = buildConflictPrompt(makePrWithChecks());

    expect(prompt).toContain('Fetch the latest changes from the base branch (main)');
    expect(prompt).toContain('Merge main into fix/login');
  });
});

describe('buildMonitorPrompt', () => {
  it('includes PR number and title', () => {
    const prompt = buildMonitorPrompt(makePrWithChecks(), makeRepoSettings());

    expect(prompt).toContain('#42');
    expect(prompt).toContain('Fix login flow');
  });

  it('includes current status', () => {
    const prompt = buildMonitorPrompt(
      makePrWithChecks({ overallStatus: 'red' }),
      makeRepoSettings(),
    );

    expect(prompt).toContain('**Current status:** red');
  });

  it('includes monitoring instructions', () => {
    const prompt = buildMonitorPrompt(makePrWithChecks(), makeRepoSettings());

    expect(prompt).toContain('monitoring this PR');
    expect(prompt).toContain('Check CI status');
    expect(prompt).toContain('Review comments');
    expect(prompt).toContain('Merge conflicts');
    expect(prompt).toContain('fix cycles');
  });

  it('includes repo-specific instructions when fixPromptTemplate is set', () => {
    const settings = makeRepoSettings({
      fixPromptTemplate: 'Always run the linter first.',
    });
    const prompt = buildMonitorPrompt(makePrWithChecks(), settings);

    expect(prompt).toContain('## Repo-Specific Instructions');
    expect(prompt).toContain('Always run the linter first.');
  });

  it('does not include repo-specific instructions when fixPromptTemplate is absent', () => {
    const prompt = buildMonitorPrompt(makePrWithChecks(), makeRepoSettings());

    expect(prompt).not.toContain('## Repo-Specific Instructions');
  });
});

describe('writePromptFile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes content to a temp file and returns path', async () => {
    const mockWriteTextFile = vi.fn().mockResolvedValue(undefined);
    const mockTempDir = vi.fn().mockResolvedValue('/tmp/');

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: mockWriteTextFile,
      BaseDirectory: { Temp: 'Temp' },
    }));
    vi.doMock('@tauri-apps/api/path', () => ({
      tempDir: mockTempDir,
      join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')),
    }));

    const { writePromptFile } = await import('../claude-launcher');
    const result = await writePromptFile('# Test prompt');

    expect(mockWriteTextFile).toHaveBeenCalledWith(
      expect.stringMatching(/^claude-prompt-\d+\.md$/),
      '# Test prompt',
      { baseDir: 'Temp' },
    );
    expect(result).toMatch(/^\/tmp\/claude-prompt-\d+\.md$/);
  });
});

describe('launchClaude', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('invokes launch_claude_code with correct parameters', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: mockInvoke,
    }));

    const { launchClaude } = await import('../claude-launcher');
    await launchClaude('/path/to/worktree', '/tmp/prompt.md', 'Fix PR #42');

    expect(mockInvoke).toHaveBeenCalledWith('launch_claude_code', {
      worktreePath: '/path/to/worktree',
      promptFile: '/tmp/prompt.md',
      initialMessage: 'Fix PR #42',
      claudeCodePath: '',
    });
  });

  it('uses empty string for message when not provided', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: mockInvoke,
    }));

    const { launchClaude } = await import('../claude-launcher');
    await launchClaude('/path/to/worktree', '/tmp/prompt.md');

    expect(mockInvoke).toHaveBeenCalledWith('launch_claude_code', {
      worktreePath: '/path/to/worktree',
      promptFile: '/tmp/prompt.md',
      initialMessage: '',
      claudeCodePath: '',
    });
  });
});

describe('performFixWithClaude', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws when no worktree path is configured', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }));

    const { performFixWithClaude } = await import('../claude-launcher');

    await expect(
      performFixWithClaude('owner', 'repo', 42, 'fix/branch', {
        repos: [],
      }),
    ).rejects.toThrow('No worktree path configured for owner/repo');
  });

  it('uses existing worktree if branch matches', async () => {
    const mockInvoke = vi.fn();
    // list_worktrees returns existing worktree
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_worktrees') {
        return Promise.resolve([
          { path: '/worktrees/fix-branch', branchName: 'fix/branch', isMainWorktree: false },
        ]);
      }
      if (cmd === 'launch_claude_code') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    const mockWriteTextFile = vi.fn().mockResolvedValue(undefined);
    const mockTempDir = vi.fn().mockResolvedValue('/tmp/');

    vi.doMock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: mockWriteTextFile,
      BaseDirectory: { Temp: 'Temp' },
    }));
    vi.doMock('@tauri-apps/api/path', () => ({ tempDir: mockTempDir, join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')) }));

    const { performFixWithClaude } = await import('../claude-launcher');

    await performFixWithClaude('owner', 'repo', 42, 'fix/branch', {
      repos: [
        {
          owner: 'owner',
          name: 'repo',
          enabled: true,
          worktreeBasePath: '/worktrees',
          worktreeSubfolder: '',
        },
      ],
    });

    // Should have called launch_claude_code with existing worktree path
    expect(mockInvoke).toHaveBeenCalledWith('launch_claude_code', expect.objectContaining({
      worktreePath: '/worktrees/fix-branch',
    }));
  });

  it('creates new worktree when branch does not exist', async () => {
    const mockInvoke = vi.fn();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_worktrees') {
        return Promise.resolve([]);
      }
      if (cmd === 'create_worktree') {
        return Promise.resolve('/worktrees/.worktrees/fix-branch');
      }
      if (cmd === 'launch_claude_code') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    const mockWriteTextFile = vi.fn().mockResolvedValue(undefined);
    const mockTempDir = vi.fn().mockResolvedValue('/tmp/');

    vi.doMock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: mockWriteTextFile,
      BaseDirectory: { Temp: 'Temp' },
    }));
    vi.doMock('@tauri-apps/api/path', () => ({ tempDir: mockTempDir, join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')) }));

    const { performFixWithClaude } = await import('../claude-launcher');

    await performFixWithClaude('owner', 'repo', 42, 'fix/branch', {
      repos: [
        {
          owner: 'owner',
          name: 'repo',
          enabled: true,
          worktreeBasePath: '/worktrees',
          worktreeSubfolder: '.trees',
        },
      ],
    });

    expect(mockInvoke).toHaveBeenCalledWith('create_worktree', {
      basePath: '/worktrees',
      subfolder: '.trees',
      branchName: 'fix/branch',
    });
    expect(mockInvoke).toHaveBeenCalledWith('launch_claude_code', expect.objectContaining({
      worktreePath: '/worktrees/.worktrees/fix-branch',
    }));
  });

  it('matches worktree by refs/heads/ prefixed branch name', async () => {
    const mockInvoke = vi.fn();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_worktrees') {
        return Promise.resolve([
          { path: '/worktrees/my-branch', branchName: 'refs/heads/my-branch', isMainWorktree: false },
        ]);
      }
      if (cmd === 'launch_claude_code') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    const mockWriteTextFile = vi.fn().mockResolvedValue(undefined);
    const mockTempDir = vi.fn().mockResolvedValue('/tmp/');

    vi.doMock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: mockWriteTextFile,
      BaseDirectory: { Temp: 'Temp' },
    }));
    vi.doMock('@tauri-apps/api/path', () => ({ tempDir: mockTempDir, join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')) }));

    const { performFixWithClaude } = await import('../claude-launcher');

    await performFixWithClaude('owner', 'repo', 42, 'my-branch', {
      repos: [
        {
          owner: 'owner',
          name: 'repo',
          enabled: true,
          worktreeBasePath: '/worktrees',
          worktreeSubfolder: '',
        },
      ],
    });

    // Should use the existing worktree, not create a new one
    expect(mockInvoke).not.toHaveBeenCalledWith('create_worktree', expect.anything());
    expect(mockInvoke).toHaveBeenCalledWith('launch_claude_code', expect.objectContaining({
      worktreePath: '/worktrees/my-branch',
    }));
  });

  it('uses empty string for worktreeSubfolder when not set', async () => {
    const mockInvoke = vi.fn();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_worktrees') return Promise.resolve([]);
      if (cmd === 'create_worktree') return Promise.resolve('/worktrees/.worktrees/branch');
      if (cmd === 'launch_claude_code') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    vi.doMock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: vi.fn().mockResolvedValue(undefined),
      BaseDirectory: { Temp: 'Temp' },
    }));
    vi.doMock('@tauri-apps/api/path', () => ({
      tempDir: vi.fn().mockResolvedValue('/tmp/'),
      join: (...parts: string[]) => Promise.resolve(parts.join('/').replace(/\/+/g, '/')),
    }));

    const { performFixWithClaude } = await import('../claude-launcher');

    await performFixWithClaude('owner', 'repo', 42, 'branch', {
      repos: [
        {
          owner: 'owner',
          name: 'repo',
          enabled: true,
          worktreeBasePath: '/worktrees',
          worktreeSubfolder: '',
        },
      ],
    });

    expect(mockInvoke).toHaveBeenCalledWith('create_worktree', {
      basePath: '/worktrees',
      subfolder: '.worktrees',
      branchName: 'branch',
    });
  });
});
