import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diskSpaceFixture } from '@/components/worktree/__fixtures__/disk-space';

const api = vi.hoisted(() => ({
  invoke: vi.fn(),
  catalogue: vi.fn(),
  launch: vi.fn(),
  show: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: api.invoke }));
vi.mock('@/services/t3/api', async (original) => ({
  ...(await original<typeof import('@/services/t3/api')>()),
  t3Catalogue: api.catalogue,
  t3LaunchThread: api.launch,
  t3ShowThread: api.show,
}));

import { useDiskSpaceStore } from '../disk-space-store';

beforeEach(() => {
  vi.clearAllMocks();
  useDiskSpaceStore.setState({ hosts: diskSpaceFixture(), cleanup: {}, error: null });
  api.catalogue.mockResolvedValue({
    environmentId: 'remote-env',
    providers: [
      {
        instanceId: 'codex',
        displayName: 'Codex',
        driver: 'codex',
        models: [{ slug: 'default', name: 'Default', isDefault: true, options: [] }],
      },
    ],
  });
  api.launch.mockResolvedValue('new-thread');
  api.show.mockResolvedValue(undefined);
});

describe('host disk cleanup', () => {
  it('launches without a project on the selected remote, then opens that same thread', async () => {
    await useDiskSpaceStore.getState().clean('mini');
    expect(api.catalogue).toHaveBeenCalledWith({ id: 'mini', baseUrl: 'http://mini:3773' });
    expect(api.launch).toHaveBeenCalledWith(
      { id: 'mini', baseUrl: 'http://mini:3773' },
      expect.objectContaining({
        projectId: null,
        title: 'Clean up disk space on Mac mini',
        prompt: expect.stringContaining('Mac mini'),
      }),
    );
    expect(api.show).toHaveBeenCalledWith(
      { id: 'mini', baseUrl: 'http://mini:3773' },
      'new-thread',
      undefined,
    );
  });
  it('coalesces repeated clicks and reopens the created thread instead of starting duplicates', async () => {
    let resolve!: (id: string) => void;
    api.launch.mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const first = useDiskSpaceStore.getState().clean('local');
    await vi.waitFor(() => expect(api.launch).toHaveBeenCalledTimes(1));
    await useDiskSpaceStore.getState().clean('local');
    resolve('local-thread');
    await first;
    await useDiskSpaceStore.getState().clean('local');
    expect(api.launch).toHaveBeenCalledTimes(1);
    expect(api.show).toHaveBeenCalledTimes(2);
  });
  it('retains the thread after opening T3 fails, so retry cannot launch another agent', async () => {
    api.show.mockRejectedValueOnce(new Error('Desktop unavailable'));
    await useDiskSpaceStore.getState().clean('mini');
    expect(useDiskSpaceStore.getState().cleanup.mini).toMatchObject({
      threadId: 'new-thread',
      error: expect.stringContaining('Thread started'),
    });
    await useDiskSpaceStore.getState().clean('mini');
    expect(api.launch).toHaveBeenCalledTimes(1);
    expect(useDiskSpaceStore.getState().cleanup.mini?.error).toBeUndefined();
  });
  it('never falls back to the local machine for an unmapped remote', async () => {
    await useDiskSpaceStore.getState().clean('vera');
    expect(api.launch).not.toHaveBeenCalled();
    expect(useDiskSpaceStore.getState().cleanup.vera?.error).toContain('Pair T3 for Vera VM');
  });
  it('coalesces probes and discards stale data on failure', async () => {
    api.invoke.mockRejectedValue(new Error('Probe failed'));
    await Promise.all([
      useDiskSpaceStore.getState().refresh(),
      useDiskSpaceStore.getState().refresh(),
    ]);
    expect(api.invoke).toHaveBeenCalledTimes(1);
    expect(useDiskSpaceStore.getState().hosts).toEqual([]);
    expect(useDiskSpaceStore.getState().error).toContain('Probe failed');
  });
});
