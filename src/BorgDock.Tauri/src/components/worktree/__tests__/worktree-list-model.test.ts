import { describe, expect, it } from 'vitest';
import type { WorktreeSnapshot } from '@/types/worktree';
import {
  flattenSnapshot,
  groupByHost,
  hostIdOf,
  rowsInOrder,
  visibleEntries,
} from '../worktree-list-model';

const remote = (label: string, sshTarget: string) => ({
  id: `${sshTarget}:repo`,
  label,
  sshTarget,
});

const SNAPSHOT: WorktreeSnapshot = [
  {
    repo: { owner: 'org', name: 'web', basePath: '/srv/web', remote: remote('Mac mini', 'mini') },
    entries: [{ path: '/srv/web', branchName: 'main', isMainWorktree: true }],
    fetchedAt: 1,
  },
  {
    repo: { owner: 'org', name: 'app', basePath: 'E:/app' },
    entries: [
      { path: 'E:/app/.worktrees/worktree2', branchName: 'b', isMainWorktree: false },
      { path: 'E:/app', branchName: 'main', isMainWorktree: true },
    ],
    fetchedAt: 1,
  },
  {
    repo: { owner: 'org', name: 'api', basePath: '/srv/api', remote: remote('Build box', ' box ') },
    entries: [],
    fetchedAt: 1,
    error: 'ssh: connect to host box port 22: Connection timed out',
  },
  {
    repo: { owner: 'org', name: 'cli', basePath: '/srv/cli', remote: remote('Mac mini', 'mini') },
    entries: [{ path: '/srv/cli', branchName: 'main', isMainWorktree: true }],
    fetchedAt: 1,
  },
];

function hostsOf(snapshot: WorktreeSnapshot, measured: { id: string; label: string }[] = []) {
  const { entries, errors } = flattenSnapshot(snapshot);
  return groupByHost(visibleEntries(entries, '', false, new Set()), errors, measured);
}

describe('groupByHost', () => {
  it('puts this machine first, then remote hosts by name, one group per repository', () => {
    const hosts = hostsOf(SNAPSHOT);
    expect(hosts.map((h) => [h.id, h.label, h.remote])).toEqual([
      ['local', '', false],
      ['box', 'Build box', true],
      ['mini', 'Mac mini', true],
    ]);
    expect(hosts[2]!.repos.map((g) => g.key)).toEqual(['Mac mini · org/cli', 'Mac mini · org/web']);
  });

  it('keeps a failed scan as an empty group under its host', () => {
    const box = hostsOf(SNAPSHOT).find((h) => h.id === 'box')!;
    expect(box.repos).toEqual([
      expect.objectContaining({
        entries: [],
        error: 'ssh: connect to host box port 22: Connection timed out',
      }),
    ]);
  });

  it('adds measured hosts that list no repository, in host order', () => {
    const hosts = hostsOf(SNAPSHOT.slice(0, 1), [
      { id: 'local', label: 'kvdborght' },
      { id: 'mini', label: 'Mac mini' },
      { id: 'vera', label: 'Vera VM' },
    ]);
    expect(hosts.map((h) => [h.id, h.remote, h.repos.length])).toEqual([
      ['local', false, 0],
      ['mini', true, 1],
      ['vera', true, 0],
    ]);
  });

  it('walks rows in the order they render: host, repository, main worktree first', () => {
    expect(rowsInOrder(hostsOf(SNAPSHOT)).map((e) => e.wt.path)).toEqual([
      'E:/app',
      'E:/app/.worktrees/worktree2',
      '/srv/cli',
      '/srv/web',
    ]);
  });
});

it('hostIdOf names a remote repository by its trimmed SSH target', () => {
  expect(hostIdOf(SNAPSHOT[2]!.repo)).toBe('box');
  expect(hostIdOf(SNAPSHOT[1]!.repo)).toBe('local');
});
