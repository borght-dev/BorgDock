import { beforeEach, describe, expect, it, vi } from 'vitest';

const persist = vi.hoisted(() => ({
  persistToTauriStore: vi.fn(),
  readFromTauriStore: vi.fn(),
}));
vi.mock('@/utils/tauri-persist', () => persist);

import { useDispatchStore } from '@/stores/dispatch-store';
import { forgetHostsExcept, recallHosts, rememberHost, resetHostMemory } from '../host-memory';
import type { AgentProject } from '../types';
import { makeThread } from './fixtures';

const MAC_PROJECT: AgentProject = {
  id: 'mac:p1',
  hostId: 'mac',
  hostLabel: 'Mac',
  available: true,
  title: 'M1',
  workspaceRoot: '/work/one',
};

const open = makeThread({ id: 'mac:t1', hostId: 'mac', hostLabel: 'Mac', projectId: 'mac:p1' });
const settled = makeThread({
  id: 'mac:t2',
  hostId: 'mac',
  hostLabel: 'Mac',
  projectId: 'mac:p1',
  open: false,
  status: 'settled',
});

function written(): unknown {
  return persist.persistToTauriStore.mock.lastCall?.[2];
}

describe('host memory', () => {
  beforeEach(() => {
    resetHostMemory();
    persist.persistToTauriStore.mockReset();
    persist.persistToTauriStore.mockResolvedValue(undefined);
    persist.readFromTauriStore.mockReset();
    persist.readFromTauriStore.mockResolvedValue(undefined);
    useDispatchStore.setState({ threads: [], projects: [], hosts: [] });
  });

  it('remembers the projects and the open threads of a host', async () => {
    useDispatchStore.setState({ threads: [open, settled], projects: [MAC_PROJECT] });

    await rememberHost('mac');

    expect(written()).toEqual({ mac: { threads: [open], projects: [MAC_PROJECT] } });
  });

  it('writes nothing while the host holds what was already remembered', async () => {
    useDispatchStore.setState({ threads: [open], projects: [MAC_PROJECT] });

    await rememberHost('mac');
    await rememberHost('mac');

    expect(persist.persistToTauriStore).toHaveBeenCalledTimes(1);
  });

  it('keeps what it knows of another host that has not answered yet', async () => {
    const vm = { threads: [], projects: [{ ...MAC_PROJECT, id: 'vm:p1', hostId: 'vm' }] };
    persist.readFromTauriStore.mockResolvedValue({ vm });
    useDispatchStore.setState({ threads: [open], projects: [MAC_PROJECT] });

    await rememberHost('mac');

    expect(written()).toMatchObject({ vm, mac: { threads: [open] } });
  });

  it('puts the last known work back as offline for a host that has not answered', async () => {
    persist.readFromTauriStore.mockResolvedValue({
      mac: { threads: [open], projects: [MAC_PROJECT] },
    });

    await recallHosts(['mac']);

    const { threads, projects } = useDispatchStore.getState();
    expect(threads).toEqual([{ ...open, available: false }]);
    expect(projects).toEqual([{ ...MAC_PROJECT, available: false }]);
  });

  it('leaves a host alone that already answered this session', async () => {
    persist.readFromTauriStore.mockResolvedValue({
      mac: { threads: [open], projects: [MAC_PROJECT] },
    });
    useDispatchStore.setState({
      hosts: [{ id: 'mac', label: 'Mac', ok: true, at: '2026-10-12T12:00:00Z', error: null }],
    });

    await recallHosts(['mac']);

    expect(useDispatchStore.getState().threads).toEqual([]);
  });

  it('recalls only the hosts that are still followed', async () => {
    persist.readFromTauriStore.mockResolvedValue({
      mac: { threads: [open], projects: [MAC_PROJECT] },
    });

    await recallHosts([]);

    expect(useDispatchStore.getState().threads).toEqual([]);
  });

  it('forgets the hosts that are no longer followed', async () => {
    persist.readFromTauriStore.mockResolvedValue({
      mac: { threads: [open], projects: [MAC_PROJECT] },
      vm: { threads: [], projects: [] },
    });

    await forgetHostsExcept(['local', 'vm']);

    expect(written()).toEqual({ vm: { threads: [], projects: [] } });
  });

  it('writes nothing when every remembered host is still followed', async () => {
    persist.readFromTauriStore.mockResolvedValue({ mac: { threads: [], projects: [] } });

    await forgetHostsExcept(['local', 'mac']);

    expect(persist.persistToTauriStore).not.toHaveBeenCalled();
  });
});
