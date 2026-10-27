import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitStore } from '@/stores/initStore';
import { useSettingsStore } from '@/stores/settings-store';
import { startApplicationRuntime } from '../application-runtime';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  createGitHub: vi.fn(),
  startDispatch: vi.fn(),
  startAdo: vi.fn(),
  resetClient: vi.fn(),
  stopDispatch: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@/services/github/singleton', () => ({ resetClient: mocks.resetClient }));
vi.mock('../initialize', () => ({ initialize: mocks.initialize }));
vi.mock('../github-sync', () => ({ createGitHubSync: mocks.createGitHub }));
vi.mock('../ado-sync', () => ({ startAdoSync: mocks.startAdo }));
vi.mock('../dispatch-sync', () => ({ startDispatchSync: mocks.startDispatch }));
vi.mock('../ci-failures-sync', () => ({ startCiFailuresSync: () => () => {} }));
vi.mock('../visibility', () => ({ startVisibilityTracking: () => () => {} }));
vi.mock('../t3-sessions', () => ({ followT3Sessions: () => () => {} }));
vi.mock('../workstreams-sync', () => ({ startWorkstreamsSync: () => () => {} }));

const original = useSettingsStore.getState().settings;
let stop: (() => void) | undefined;
const integrations: { refresh: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  integrations.length = 0;
  useInitStore.getState().reset();
  useSettingsStore.setState({
    hasLoaded: true,
    settings: {
      ...original,
      setupComplete: true,
      gitHub: { ...original.gitHub, authMethod: 'ghCli' },
      repos: [
        { owner: 'org', name: 'repo', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
      ],
    },
  });
  vi.spyOn(useSettingsStore.getState(), 'loadSettings').mockResolvedValue(undefined);
  mocks.initialize.mockResolvedValue(true);
  mocks.startDispatch.mockReturnValue(mocks.stopDispatch);
  mocks.createGitHub.mockImplementation(() => {
    const integration = { refresh: vi.fn().mockResolvedValue(undefined), stop: vi.fn() };
    integrations.push(integration);
    return integration;
  });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  useSettingsStore.setState({ settings: original, hasLoaded: false });
});

describe('application runtime', () => {
  it('owns refresh without React consumers and ignores presentation-only settings changes', async () => {
    stop = startApplicationRuntime();
    await Promise.resolve();
    document.dispatchEvent(new Event('borgdock-refresh'));
    expect(integrations[0]!.refresh).toHaveBeenCalledOnce();
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...settings, ui: { ...settings.ui, theme: 'dark' } } });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.createGitHub).toHaveBeenCalledOnce();
    expect(mocks.startDispatch).toHaveBeenCalledOnce();
    stop();
    document.dispatchEvent(new Event('borgdock-refresh'));
    expect(integrations[0]!.refresh).toHaveBeenCalledOnce();
  });

  it('discards an obsolete startup and starts Dispatch once for the current configuration', async () => {
    let finishOld!: (ready: boolean) => void;
    mocks.initialize.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishOld = resolve;
      }),
    );
    stop = startApplicationRuntime();
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...settings, gitHub: { ...settings.gitHub, pollIntervalSeconds: 120 } },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(integrations[0]!.stop).toHaveBeenCalledOnce();
    finishOld(true);
    await Promise.resolve();
    expect(mocks.createGitHub).toHaveBeenCalledTimes(2);
    expect(mocks.startDispatch).toHaveBeenCalledOnce();
  });

  it('keeps dependent work stopped after failed initialization and permits an explicit retry', async () => {
    mocks.initialize.mockResolvedValueOnce(false);
    stop = startApplicationRuntime();
    await Promise.resolve();
    expect(mocks.startDispatch).not.toHaveBeenCalled();
    useInitStore.getState().reset();
    await Promise.resolve();
    expect(mocks.createGitHub).toHaveBeenCalledTimes(2);
    expect(mocks.startDispatch).toHaveBeenCalledOnce();
  });
});
