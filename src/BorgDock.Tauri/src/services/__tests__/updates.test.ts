import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  restart: vi.fn(),
}));

vi.mock('@/generated/commands', () => ({
  commands: {
    checkForUpdate: mocks.check,
    downloadUpdate: mocks.download,
    restartToApplyUpdate: mocks.restart,
  },
}));

import {
  checkForUpdate,
  downloadUpdate,
  lastCheckedLabel,
  restartToApplyUpdate,
  updateNotice,
  updateStatusLine,
} from '../updates';

const idle: UpdateStatus = {
  phase: 'idle',
  currentVersion: '4.16.0',
  version: null,
  progress: 0,
  lastCheckedAt: null,
  lastError: null,
};
const found = (phase: UpdateStatus['phase'], extra: Partial<UpdateStatus> = {}): UpdateStatus => ({
  ...idle,
  phase,
  version: '4.17.0',
  lastCheckedAt: '2026-11-24T09:00:10Z',
  ...extra,
});

describe('update actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.getState().reset();
  });

  it('a check puts the answer in the store', async () => {
    mocks.check.mockResolvedValue(found('available'));
    await checkForUpdate();
    expect(useUpdateStore.getState()).toMatchObject({ phase: 'available', version: '4.17.0' });
  });

  it('a download puts the answer in the store', async () => {
    mocks.download.mockResolvedValue(found('ready', { progress: 100 }));
    await downloadUpdate();
    expect(useUpdateStore.getState()).toMatchObject({ phase: 'ready', progress: 100 });
  });

  it('a check that cannot reach Rust leaves the store as it was', async () => {
    useUpdateStore.getState().setStatus(found('available'));
    mocks.check.mockRejectedValue(new Error('ipc closed'));
    await checkForUpdate();
    expect(useUpdateStore.getState().phase).toBe('available');
  });

  it('restarts only when asked', async () => {
    mocks.restart.mockResolvedValue({ status: 'ok', data: null });
    await restartToApplyUpdate();
    expect(mocks.restart).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().restarting).toBe(true);
  });

  it('ignores a second restart click while the installer starts', () => {
    mocks.restart.mockReturnValue(new Promise(() => {}));
    void restartToApplyUpdate();
    void restartToApplyUpdate();
    expect(mocks.restart).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().restarting).toBe(true);
  });

  it('lets you try again after a failed restart', async () => {
    mocks.restart.mockResolvedValue({ status: 'error', error: 'installer could not start' });
    await restartToApplyUpdate();
    expect(useUpdateStore.getState().restarting).toBe(false);
    await restartToApplyUpdate();
    expect(mocks.restart).toHaveBeenCalledTimes(2);
  });
});

describe('updateNotice', () => {
  it('says an update is ready once it is downloaded', () => {
    expect(updateNotice(found('downloading'), found('ready'), true)).toMatchObject({
      key: 'ready:4.17.0',
      title: 'Update ready',
      body: 'Restart BorgDock to apply v4.17.0.',
    });
  });

  it('says an update is available only when it is not downloaded by itself', () => {
    expect(updateNotice(idle, found('available'), false)).toMatchObject({
      key: 'available:4.17.0',
      title: 'Update available: v4.17.0',
    });
    expect(updateNotice(idle, found('available'), true)).toBeNull();
  });

  it('says nothing when neither the phase nor the version moved', () => {
    expect(updateNotice(found('ready'), found('ready'), false)).toBeNull();
    expect(
      updateNotice(found('downloading'), found('downloading', { progress: 42 }), false),
    ).toBeNull();
  });

  it('says nothing for a check that found nothing or failed', () => {
    expect(updateNotice({ phase: 'checking', version: null }, idle, false)).toBeNull();
    expect(
      updateNotice({ phase: 'checking', version: null }, { ...idle, lastError: 'offline' }, false),
    ).toBeNull();
  });

  it('announces a newer version found while one waits', () => {
    const newer = found('available', { version: '4.18.0' });
    expect(updateNotice(found('available'), newer, false)?.key).toBe('available:4.18.0');
  });
});

describe('labels', () => {
  const now = new Date('2026-11-24T09:12:30Z').getTime();

  it('says how long ago the last check finished', () => {
    expect(lastCheckedLabel('2026-11-24T09:00:10Z', now)).toBe('Last checked 12 min ago');
    expect(lastCheckedLabel('2026-11-24T09:12:10Z', now)).toBe('Last checked just now');
  });

  it('says so when no check has finished', () => {
    expect(lastCheckedLabel(null, now)).toBe('Not checked yet');
  });

  it('describes each phase in one line', () => {
    expect(updateStatusLine(idle)).toBe('');
    expect(updateStatusLine({ ...idle, lastCheckedAt: '2026-11-24T09:00:10Z' })).toBe(
      "You're on the latest version",
    );
    expect(updateStatusLine({ ...idle, phase: 'checking' })).toBe('Checking for updates…');
    expect(updateStatusLine(found('available'))).toBe('Update available: v4.17.0');
    expect(updateStatusLine(found('downloading', { progress: 42 }))).toBe(
      'Downloading v4.17.0… 42%',
    );
    expect(updateStatusLine(found('ready'))).toBe('Update ready — restart to apply');
  });

  it('never calls a failed check "latest"', () => {
    const failed = { ...idle, lastCheckedAt: '2026-11-24T09:00:10Z', lastError: 'offline' };
    expect(updateStatusLine(failed)).toBe('');
  });
});
