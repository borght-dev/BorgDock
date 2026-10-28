import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProject, AgentThread } from '@/services/dispatch/types';
import type { PullRequest } from '@/types';

const t3 = vi.hoisted(() => ({
  t3OpenPrThread: vi.fn(async (..._args: unknown[]) => 'new-thread'),
  t3ShowThread: vi.fn(async () => {}),
  t3Snapshot: vi.fn(),
}));
vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));

const mockEmitTo = vi.fn(async () => {});
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: (...args: unknown[]) => mockEmitTo(...(args as [])),
}));

const window = vi.hoisted(() => ({ main: true }));
vi.mock('@/services/navigation', () => ({
  isMainWindow: () => window.main,
  MAIN_WINDOW_LABEL: 'main',
}));

const mockGuardLaunch = vi.fn(async () => 'proceed');
vi.mock('@/services/ci-failures/launch-guard', () => ({
  guardLaunch: (...args: unknown[]) => mockGuardLaunch(...(args as [])),
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
import { OPEN_PR_THREAD_EVENT, openPrThread, openT3Thread, requestT3Thread } from '../t3-thread';

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

const project: AgentProject = {
  id: 'mac:p-repo',
  hostId: 'mac',
  hostLabel: 'Mac',
  available: true,
  title: 'repo',
  workspaceRoot: '/src/repo',
  repository: {
    key: 'github.com/test/repo',
    displayName: 'test/repo',
    owner: 'test',
    name: 'repo',
  },
};

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'mac:t-1',
    hostId: 'mac',
    hostLabel: 'Mac',
    available: true,
    projectId: 'mac:p-repo',
    place: 'repo',
    title: 'Earlier work',
    branch: 'feat/thing',
    worktreePath: '/src/repo-t3-1',
    createdAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T00:00:00Z',
    open: false,
    status: 'settled',
    interactionMode: 'default',
    model: 'opus',
    modelInstance: 'claudeAgent',
    effort: null,
    pullRequests: [],
    firstUserMessage: '',
    questionRequestId: null,
    questions: [],
    lastAgentMessage: null,
    ...overrides,
  };
}

const REQUEST = {
  title: 'PR #42: Add thing',
  repository: 'test/repo',
  prNumber: 42,
  prUrl: 'https://github.com/test/repo/pull/42',
  model: 'claude-fable-5',
  modelInstance: 'claudeAgent',
};

describe('requestT3Thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.main = true;
    useT3ThreadStore.getState().setPendingPr(null);
  });

  it('asks where the thread runs once the launch guard lets it', async () => {
    await requestT3Thread(pr);

    expect(mockGuardLaunch).toHaveBeenCalledWith(
      { owner: 'test', repo: 'repo', prNumber: pr.number, checkNames: [] },
      'Open in T3',
    );
    expect(useT3ThreadStore.getState().pendingPr).toEqual(pr);
  });

  it('opens nothing when the launch guard cancels', async () => {
    mockGuardLaunch.mockResolvedValueOnce('cancel');
    await requestT3Thread(pr);
    expect(useT3ThreadStore.getState().pendingPr).toBeNull();
  });

  it('hands the request to the main window from any other window', async () => {
    window.main = false;
    await requestT3Thread(pr);

    expect(mockEmitTo).toHaveBeenCalledWith('main', OPEN_PR_THREAD_EVENT, pr);
    expect(mockGuardLaunch).not.toHaveBeenCalled();
    expect(useT3ThreadStore.getState().pendingPr).toBeNull();
  });
});

describe('openPrThread', () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets T3 check the branch out in the project's repository, with the ids the host knows", async () => {
    const id = await openPrThread(pr, {
      kind: 'worktree',
      hostId: 'mac',
      project,
      baseRef: null,
    });

    expect(t3.t3OpenPrThread).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: undefined },
      { ...REQUEST, projectId: 'p-repo', workspace: { type: 'checkOut' } },
      'C:/t3/T3.exe',
    );
    expect(id).toBe('mac:new-thread');
  });

  it("starts in an earlier thread's checkout, or in its project's own", async () => {
    await openPrThread(pr, { kind: 'thread-worktree', hostId: 'mac', thread: thread() });
    await openPrThread(pr, {
      kind: 'thread-worktree',
      hostId: 'mac',
      thread: thread({ worktreePath: null }),
    });

    expect(
      t3.t3OpenPrThread.mock.calls.map((call) => (call[1] as { workspace: unknown }).workspace),
    ).toEqual([
      { type: 'existingWorktree', worktreePath: '/src/repo-t3-1', branch: 'feat/thing' },
      { type: 'root' },
    ]);
  });

  it('only shows a thread it continues', async () => {
    const id = await openPrThread(pr, { kind: 'continue', hostId: 'mac', thread: thread() });

    expect(t3.t3ShowThread).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: undefined },
      't-1',
      'C:/t3/T3.exe',
    );
    expect(t3.t3OpenPrThread).not.toHaveBeenCalled();
    expect(id).toBe('mac:t-1');
  });
});

describe('openT3Thread', () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a worktree on this machine under T3's project for the repository", async () => {
    t3.t3Snapshot.mockResolvedValue({
      changed: true,
      sequence: 1,
      threads: [],
      projects: [
        {
          id: 'p-w3',
          title: 'W3',
          workspaceRoot: '/code/repo/.worktrees/three',
          repository: project.repository,
        },
        {
          id: 'p-repo',
          title: 'repo',
          workspaceRoot: '/code/repo',
          repository: project.repository,
        },
      ],
    });

    await openT3Thread(pr, '/code/repo/.worktrees/feat-thing');

    expect(t3.t3OpenPrThread).toHaveBeenCalledWith(
      { id: 'local', baseUrl: undefined },
      {
        ...REQUEST,
        projectId: 'p-repo',
        workspace: {
          type: 'existingWorktree',
          worktreePath: '/code/repo/.worktrees/feat-thing',
          branch: 'feat/thing',
        },
      },
      'C:/t3/T3.exe',
    );
  });

  it('says so when T3 has no project for the repository', async () => {
    t3.t3Snapshot.mockResolvedValue({ changed: true, sequence: 1, threads: [], projects: [] });
    await expect(openT3Thread(pr, '/code/repo/.worktrees/feat-thing')).rejects.toThrow(
      'no project for test/repo',
    );
  });
});
