import { act, render, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import type { WorktreeSnapshot } from '@/types/worktree';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

import {
  countLinkedWorktrees,
  publishWorktreeCount,
  useWorktreeCount,
  useWorktreeMap,
} from '@/hooks/useWorktreeMap';
import { WorktreeList } from '../WorktreeList';

/**
 * Two local repos that both have a `feature/x` branch checked out, and a
 * remote repo: five linked worktrees. The branch map the PR cards use keeps
 * one `feature/x` and no remote entries, so it cannot be the rail's count.
 */
const SNAPSHOT: WorktreeSnapshot = [
  {
    repo: { owner: 'org', name: 'app', basePath: '/src/app' },
    entries: [
      { path: '/src/app', branchName: 'main', isMainWorktree: true },
      { path: '/src/app/wt1', branchName: 'feature/x', isMainWorktree: false },
      { path: '/src/app/wt2', branchName: 'fix/y', isMainWorktree: false },
    ],
    fetchedAt: 0,
  },
  {
    repo: { owner: 'org', name: 'site', basePath: '/src/site' },
    entries: [
      { path: '/src/site', branchName: 'main', isMainWorktree: true },
      { path: '/src/site/wt1', branchName: 'feature/x', isMainWorktree: false },
    ],
    fetchedAt: 0,
  },
  {
    repo: {
      owner: 'org',
      name: 'app',
      basePath: '/src/app',
      remote: { id: 'mac', label: 'Mac mini', sshTarget: 'me@mac' },
    },
    entries: [
      { path: '/src/app', branchName: 'main', isMainWorktree: true },
      { path: '/src/app/wt1', branchName: 'feature/x', isMainWorktree: false },
    ],
    fetchedAt: 0,
  },
];

function settingsWith(repos: AppSettings['repos']): AppSettings {
  return { ...useSettingsStore.getState().settings, repos };
}

describe('useWorktreeCount', () => {
  it('counts every non-main worktree once per repository and path, remote included', () => {
    expect(countLinkedWorktrees(SNAPSHOT)).toBe(4);
    expect(countLinkedWorktrees([])).toBe(0);
  });

  it('follows the snapshot useWorktreeMap reads, not the branch map', async () => {
    publishWorktreeCount([]);
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'worktree_cache_get_all' ? SNAPSHOT : null),
    );
    const settings = settingsWith([
      {
        owner: 'org',
        name: 'app',
        enabled: true,
        worktreeBasePath: '/src/app',
        worktreeSubfolder: '',
      },
      {
        owner: 'org',
        name: 'site',
        enabled: true,
        worktreeBasePath: '/src/site',
        worktreeSubfolder: '',
      },
    ]);
    const { result } = renderHook(() => {
      useWorktreeMap(settings);
      return useWorktreeCount();
    });
    await waitFor(() => expect(result.current).toBe(4));
  });

  it('matches the rows the Worktrees section lists', async () => {
    publishWorktreeCount([]);
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'worktree_cache_get_all' || cmd === 'worktree_cache_refresh' ? SNAPSHOT : [],
      ),
    );
    const { result } = renderHook(() => useWorktreeCount());
    await act(async () => {
      render(<WorktreeList host="section" />);
    });
    await waitFor(() => expect(document.querySelectorAll('[data-worktree-row]')).toHaveLength(7));
    const linkedRows = document.querySelectorAll(
      '[data-worktree-row]:not([data-tree-path="/src/app"]):not([data-tree-path="/src/site"])',
    );
    expect(linkedRows).toHaveLength(4);
    expect(result.current).toBe(4);
  });
});
