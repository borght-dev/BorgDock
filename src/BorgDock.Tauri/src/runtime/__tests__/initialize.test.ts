import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitStore } from '@/stores/initStore';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { initialize } from '../initialize';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  token: vi.fn(),
  cached: vi.fn(),
  etags: vi.fn(),
  get: vi.fn(),
  seed: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/github/auth', () => ({ getGitHubToken: mocks.token }));
vi.mock('@/services/cache', () => ({ loadCachedPRs: mocks.cached, loadCachedEtags: mocks.etags }));
vi.mock('@/services/github/singleton', () => ({
  initClient: () => ({ get: mocks.get }),
  getClient: () => ({ seedEtagCache: mocks.seed }),
  bindRepoClient: vi.fn(),
}));

const settings = () => ({
  ...useSettingsStore.getState().settings,
  gitHub: { authMethod: 'ghCli' as const, username: 'tester', pollIntervalSeconds: 60 },
  repos: [
    { owner: 'org', name: 'repo', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
  ],
});
const sync = () => ({
  start: vi.fn(),
  stop: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  vi.clearAllMocks();
  useInitStore.getState().reset();
  usePrStore.setState({ pullRequests: [], username: '' });
  mocks.invoke.mockResolvedValue(undefined);
  mocks.token.mockResolvedValue('fixture-token');
  mocks.cached.mockResolvedValue([]);
  mocks.etags.mockResolvedValue([]);
  mocks.get.mockResolvedValue({ login: 'tester' });
});

describe('initialization', () => {
  it('waits for SQLite readiness before reading the cache and refreshes through one pipeline', async () => {
    let ready!: () => void;
    mocks.invoke.mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    const integration = sync();
    const initializing = initialize(settings(), integration, () => false);
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('cache_init'));
    expect(mocks.cached).not.toHaveBeenCalled();
    ready();
    await initializing;
    expect(integration.start).toHaveBeenCalledWith(true);
    expect(integration.refresh).toHaveBeenCalledOnce();
    expect(useInitStore.getState().isComplete).toBe(true);
    expect(mocks.get).toHaveBeenCalledWith('user');
  });

  it('shows cached data while the same refresh pipeline remains in flight', async () => {
    const cached = {
      pullRequest: { repoOwner: 'org', repoName: 'repo', number: 1, requestedReviewers: [] },
    } as unknown as PullRequestWithChecks;
    mocks.cached.mockResolvedValue([cached]);
    const integration = sync();
    integration.refresh.mockReturnValue(new Promise(() => {}));
    await initialize(settings(), integration, () => false);
    expect(usePrStore.getState().pullRequests).toEqual([cached]);
    expect(useInitStore.getState().isComplete).toBe(true);
    expect(integration.refresh).toHaveBeenCalledOnce();
  });

  it('reports a cold refresh failure and never marks initialization complete', async () => {
    const integration = sync();
    integration.refresh.mockRejectedValue(new Error('offline'));
    await initialize(settings(), integration, () => false);
    expect(useInitStore.getState().error).toEqual({ stepId: 'fetch-prs', message: 'offline' });
    expect(useInitStore.getState().isComplete).toBe(false);
  });

  it('removes data from disabled repositories before rendering a changed configuration', async () => {
    usePrStore.setState({
      pullRequests: [
        { pullRequest: { repoOwner: 'old', repoName: 'repo', number: 1 } } as PullRequestWithChecks,
      ],
    });
    const integration = sync();
    await initialize(settings(), integration, () => false);
    expect(usePrStore.getState().pullRequests).toEqual([]);
    expect(integration.refresh).toHaveBeenCalledOnce();
  });

  it('does not start background work after its generation is cancelled', async () => {
    const integration = sync();
    await initialize(settings(), integration, () => true);
    expect(integration.start).not.toHaveBeenCalled();
    expect(mocks.cached).not.toHaveBeenCalled();
    expect(useInitStore.getState().isComplete).toBe(false);
  });
});
