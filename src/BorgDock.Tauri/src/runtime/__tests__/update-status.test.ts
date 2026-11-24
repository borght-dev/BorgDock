import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';
import { followUpdateStatus } from '../update-status';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  notify: vi.fn(),
  unlisten: vi.fn(),
  changed: undefined as ((event: { payload: unknown }) => void) | undefined,
}));

vi.mock('@/generated/commands', () => ({
  commands: { updateStatus: mocks.status },
  events: {
    updateStatusChanged: {
      listen: vi.fn(async (handler: typeof mocks.changed) => {
        mocks.changed = handler;
        return mocks.unlisten;
      }),
    },
  },
}));
vi.mock('@/services/notification', () => ({ sendOsNotification: mocks.notify }));

const idle: UpdateStatus = {
  phase: 'idle',
  currentVersion: '4.16.0',
  version: null,
  progress: 0,
  lastCheckedAt: null,
  lastError: null,
};
const found = (phase: UpdateStatus['phase'], version = '4.17.0'): UpdateStatus => ({
  ...idle,
  phase,
  version,
  lastCheckedAt: '2026-11-24T09:00:10Z',
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const hear = (status: UpdateStatus) => mocks.changed?.({ payload: status });

function setAutoDownload(autoDownload: boolean) {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...settings, updates: { ...settings.updates, autoDownload } },
  });
}

describe('followUpdateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changed = undefined;
    mocks.notify.mockResolvedValue(undefined);
    mocks.status.mockResolvedValue(idle);
    useUpdateStore.getState().reset();
    setAutoDownload(true);
  });

  it('reads the status once and then follows every change', async () => {
    const stop = followUpdateStatus();
    await settle();
    expect(mocks.status).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().currentVersion).toBe('4.16.0');

    hear({ ...found('downloading'), progress: 42 });
    expect(useUpdateStore.getState()).toMatchObject({ phase: 'downloading', progress: 42 });
    stop();
    expect(mocks.unlisten).toHaveBeenCalledOnce();
  });

  it('does not let the first read undo a change heard meanwhile', async () => {
    let answer: (status: UpdateStatus) => void = () => {};
    mocks.status.mockReturnValue(new Promise<UpdateStatus>((resolve) => (answer = resolve)));
    followUpdateStatus();
    await settle();
    hear(found('ready'));
    answer(idle);
    await settle();
    expect(useUpdateStore.getState().phase).toBe('ready');
  });

  it('announces a ready update once per version, from the notifying window only', async () => {
    followUpdateStatus({ notify: true });
    await settle();
    hear(found('downloading'));
    hear(found('ready'));
    hear({ ...found('installing') });
    hear({ ...found('ready'), lastError: 'Could not start the installer' });
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update ready', severity: 'success' }),
    );
  });

  it('announces an available update when it is not downloaded by itself', async () => {
    setAutoDownload(false);
    followUpdateStatus({ notify: true });
    await settle();
    hear(found('available'));
    hear({ ...found('checking') });
    hear(found('available'));
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Update available: v4.17.0' }),
    );
  });

  it('a window that only shows the status sends no notification', async () => {
    setAutoDownload(false);
    followUpdateStatus();
    await settle();
    hear(found('available'));
    hear(found('ready'));
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().phase).toBe('ready');
  });

  it('does not announce what was already there when the window started', async () => {
    mocks.status.mockResolvedValue(found('ready'));
    followUpdateStatus({ notify: true });
    await settle();
    expect(useUpdateStore.getState().phase).toBe('ready');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stops listening when stopped before the listener was attached', async () => {
    const stop = followUpdateStatus();
    stop();
    await settle();
    expect(mocks.unlisten).toHaveBeenCalledOnce();
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
