import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { WorktreeList } from '../WorktreeList';

const BASE = '/home/user/repo';
const PATH_A = `${BASE}/.worktrees/worktree1`;
const PATH_B = `${BASE}/.worktrees/worktree2`;

const SNAPSHOT: WorktreeSnapshot = [
  {
    repo: { owner: 'org', name: 'repo', basePath: BASE },
    entries: [
      { path: BASE, branchName: 'main', isMainWorktree: true },
      { path: PATH_B, branchName: 'feature/482', isMainWorktree: false },
      { path: PATH_A, branchName: 'fix/login', isMainWorktree: false },
    ],
    fetchedAt: 1,
  },
];

/** What the window reads from the settings file. */
const SETTINGS: Pick<AppSettings, 'repos'> = {
  repos: [
    {
      owner: 'org',
      name: 'repo',
      enabled: true,
      worktreeBasePath: BASE,
      worktreeSubfolder: '.worktrees',
      favoriteWorktreePaths: [PATH_B],
    },
  ],
};

async function renderList() {
  await act(async () => {
    render(<WorktreeList />);
  });
  await waitFor(() => expect(rowPaths()).toHaveLength(3));
}

function rowPaths(): (string | null)[] {
  return [...document.querySelectorAll('[data-worktree-row]')].map((r) =>
    r.getAttribute('data-tree-path'),
  );
}

function branches(): (string | null)[] {
  return [...document.querySelectorAll('[data-worktree-branch]')].map((b) => b.textContent);
}

function row(path: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-worktree-row][data-tree-path="${path}"]`);
  if (!el) throw new Error(`no row for ${path}`);
  return el;
}

function savedRepos(): AppSettings['repos'] | undefined {
  const call = invoke.mock.calls.find((c) => c[0] === 'save_settings');
  return (call?.[1] as { settings: AppSettings } | undefined)?.settings.repos;
}

describe('WorktreeList', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') return Promise.resolve(SETTINGS);
      if (cmd === 'worktree_cache_get_all' || cmd === 'worktree_cache_refresh') {
        return Promise.resolve(SNAPSHOT);
      }
      if (cmd === 'list_worktrees') return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  it('lists the worktrees from the cache, main first, then by folder', async () => {
    await renderList();
    expect(rowPaths()).toEqual([BASE, PATH_A, PATH_B]);
    expect(branches()).toEqual(['main', 'fix/login', 'feature/482']);
    expect(screen.getByText('org/repo')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('worktree_cache_get_all');
  });

  it('marks favourites and saves a toggled star to the repository', async () => {
    await renderList();
    const starB = within(row(PATH_B)).getByRole('button', { pressed: true });
    expect(starB).toBeInTheDocument();
    const starA = within(row(PATH_A)).getByRole('button', { pressed: false });

    await act(async () => {
      fireEvent.click(starA);
    });

    await waitFor(() => expect(savedRepos()).toBeDefined());
    expect(savedRepos()?.[0]?.favoriteWorktreePaths).toEqual([PATH_B, PATH_A]);
    await waitFor(() =>
      expect(within(row(PATH_A)).getByRole('button', { pressed: true })).toBeInTheDocument(),
    );
  });

  it('filters rows by the search box', async () => {
    await renderList();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Filter worktrees' }), {
        target: { value: 'login' },
      });
    });
    expect(branches()).toEqual(['fix/login']);
  });

  it('opens the prune dialog', async () => {
    await renderList();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /prune/i }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Prune worktrees')).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('list_worktrees', { basePath: BASE }));
  });

  it('opens a terminal in the worktree', async () => {
    await renderList();
    const button = row(PATH_A).querySelector('[data-action="open-terminal"]');
    expect(button).not.toBeNull();
    await act(async () => {
      fireEvent.click(button!);
    });
    expect(invoke).toHaveBeenCalledWith('open_in_terminal', { path: PATH_A });
  });
});
