import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types/settings';
import type { WorktreeSnapshot } from '@/types/worktree';

/**
 * WorktreeList renders and acts the same in both of its hosts, the worktrees
 * tool window and the main window's Worktrees section: every case below runs
 * once per host, through a render wrapper that sets up what that host reads
 * (the tool window its settings file, the section the settings store).
 */

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

const openT3Thread = vi.fn((..._args: unknown[]) => Promise.resolve({ tier: 2 }));
vi.mock('@/services/t3-thread', () => ({
  openT3Thread: (...args: unknown[]) => openT3Thread(...args),
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

const REPOS: AppSettings['repos'] = [
  {
    owner: 'org',
    name: 'repo',
    enabled: true,
    worktreeBasePath: BASE,
    worktreeSubfolder: '.worktrees',
    favoriteWorktreePaths: [PATH_B],
  },
];

function mockCommands(fileSettings: unknown) {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === 'load_settings') return Promise.resolve(fileSettings);
    if (cmd === 'worktree_cache_get_all' || cmd === 'worktree_cache_refresh') {
      return Promise.resolve(SNAPSHOT);
    }
    if (cmd === 'list_worktrees') return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

type Host = 'window' | 'section';

async function renderHost(host: Host) {
  const defaults = useSettingsStore.getState().settings;
  const settings: AppSettings = { ...defaults, repos: REPOS };
  if (host === 'section') {
    // The main window's settings store is hydrated; the tool window's is not.
    useSettingsStore.setState({ settings, hasLoaded: true });
    mockCommands(defaults);
  } else {
    mockCommands(settings);
  }
  await act(async () => {
    render(<WorktreeList host={host} />);
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

const initialSettings = useSettingsStore.getState().settings;
const initialPrs = usePrStore.getState();

describe.each<Host>(['window', 'section'])('WorktreeList (%s host)', (host) => {
  beforeEach(() => {
    invoke.mockReset();
    openT3Thread.mockClear();
    localStorage.clear();
    usePrStore.setState({ pullRequests: [], lastPollTime: null });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: initialSettings });
    usePrStore.setState({
      pullRequests: initialPrs.pullRequests,
      lastPollTime: initialPrs.lastPollTime,
    });
  });

  it('lists the worktrees from the cache, main first, then by folder', async () => {
    await renderHost(host);
    expect(rowPaths()).toEqual([BASE, PATH_A, PATH_B]);
    expect(branches()).toEqual(['main', 'fix/login', 'feature/482']);
    expect(screen.getByText('org/repo')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('worktree_cache_get_all');
  });

  it('marks favourites and saves a toggled star to the repository', async () => {
    await renderHost(host);
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
    await renderHost(host);
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Filter worktrees' }), {
        target: { value: 'login' },
      });
    });
    expect(branches()).toEqual(['fix/login']);
  });

  it('opens the prune dialog', async () => {
    await renderHost(host);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /prune/i }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Prune worktrees')).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('list_worktrees', { basePath: BASE }));
  });

  it('opens a terminal in the worktree', async () => {
    await renderHost(host);
    const button = row(PATH_A).querySelector('[data-action="open-terminal"]');
    expect(button).not.toBeNull();
    await act(async () => {
      fireEvent.click(button!);
    });
    expect(invoke).toHaveBeenCalledWith('open_in_terminal', { path: PATH_A });
  });

  it('offers T3 only where it knows the pull request of the branch', async () => {
    const pr = listPr({ number: 482, title: 'T3 sessions', repo: 'org/repo' });
    usePrStore.setState({ pullRequests: [pr] });
    await renderHost(host);

    expect(row(PATH_A).querySelector('[data-action="open-t3"]')).toBeNull();
    const button = row(PATH_B).querySelector('[data-action="open-t3"]');
    if (host === 'window') {
      // The tool window never has PR data in the app, so it never links a
      // PR and never offers T3, even when a PR store happens to be filled.
      expect(button).toBeNull();
      return;
    }
    expect(button).not.toBeNull();
    await act(async () => {
      fireEvent.click(button!);
    });
    expect(openT3Thread).toHaveBeenCalledWith(pr.pullRequest, PATH_B);
  });
});
