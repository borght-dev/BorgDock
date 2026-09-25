import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types/settings';
import type { WorktreeInfo, WorktreeSnapshot } from '@/types/worktree';
import type { WorktreeChangeSet } from '@/types/worktree-changes';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

const showPr = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/services/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/navigation')>()),
  showPr: (...args: unknown[]) => showPr(...args),
}));

import { WORKTREES_STATUS_HINT, WorktreesSection } from '../WorktreesSection';

const BASE = '/home/user/repo';
const PATH_A = `${BASE}/.worktrees/worktree1`;
const PATH_B = `${BASE}/.worktrees/worktree2`;

const SNAPSHOT: WorktreeSnapshot = [
  {
    repo: { owner: 'org', name: 'repo', basePath: BASE },
    entries: [
      { path: BASE, branchName: 'main', isMainWorktree: true },
      { path: PATH_A, branchName: 'fix/login', isMainWorktree: false },
      { path: PATH_B, branchName: 'feature/482', isMainWorktree: false },
    ],
    fetchedAt: 1,
  },
];

const STATUSES: WorktreeInfo[] = [
  {
    path: PATH_A,
    branchName: 'fix/login',
    isMainWorktree: false,
    status: 'dirty',
    uncommittedCount: 3,
    ahead: 0,
    behind: 0,
    commitSha: 'abc',
  },
  {
    path: PATH_B,
    branchName: 'feature/482',
    isMainWorktree: false,
    status: 'clean',
    uncommittedCount: 0,
    ahead: 1,
    behind: 0,
    commitSha: 'def',
  },
];

const CHANGES: WorktreeChangeSet = {
  vsHead: [
    {
      path: 'src/login.ts',
      previousPath: null,
      status: 'modified',
      additions: 4,
      deletions: 1,
      isBinary: false,
      isSubmodule: false,
    },
  ],
  vsBase: [],
  baseBranch: 'main',
  baseBranchSource: 'origin-head',
  detachedHead: false,
  mergeBaseUnavailable: false,
};

const PR = listPr({
  number: 482,
  title: 'T3 sessions',
  repo: 'org/repo',
  checks: { total: 6, fail: 1 },
});

const initialSettings = useSettingsStore.getState().settings;

async function renderSection() {
  await act(async () => {
    render(<WorktreesSection />);
  });
  await waitFor(() => expect(document.querySelectorAll('[data-worktree-row]')).toHaveLength(3));
}

function row(path: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-worktree-row][data-tree-path="${path}"]`);
  if (!el) throw new Error(`no row for ${path}`);
  return el;
}

function selectedPath(): string | null {
  return (
    document
      .querySelector('[data-worktree-row][data-selected="true"]')
      ?.getAttribute('data-tree-path') ?? null
  );
}

function press(key: string, target: Element = document.body) {
  fireEvent.keyDown(target, { key });
}

describe('WorktreesSection', () => {
  beforeEach(() => {
    invoke.mockReset();
    showPr.mockClear();
    localStorage.clear();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'worktree_cache_get_all' || cmd === 'worktree_cache_refresh') {
        return Promise.resolve(SNAPSHOT);
      }
      if (cmd === 'list_worktrees') return Promise.resolve(STATUSES);
      if (cmd === 'list_worktree_changes') return Promise.resolve(CHANGES);
      if (cmd === 't3_open_thread') return Promise.resolve({ tier: 2, threadId: 't1' });
      return Promise.resolve(null);
    });
    useSettingsStore.setState({
      settings: {
        ...initialSettings,
        repos: [
          {
            owner: 'org',
            name: 'repo',
            enabled: true,
            worktreeBasePath: BASE,
            worktreeSubfolder: '.worktrees',
          },
        ] satisfies AppSettings['repos'],
      },
    });
    usePrStore.setState({ pullRequests: [PR] });
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: initialSettings });
    usePrStore.setState({ pullRequests: [] });
  });

  it('has a head row with search, prune, refresh and the tool window', async () => {
    await renderSection();
    expect(screen.getByRole('heading', { name: 'Worktrees' })).toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Filter worktrees' });
    expect(search).toHaveAttribute('data-section-search');
    expect(screen.getByRole('button', { name: 'Prune' })).toBeInTheDocument();
    expect(screen.getByTitle('Refresh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open worktrees window' }));
    expect(invoke).toHaveBeenCalledWith('open_tool_window', { tool: 'worktrees' });
  });

  it('shows the working-tree state and the linked pull request in the rows', async () => {
    await renderSection();
    await waitFor(() => expect(within(row(PATH_A)).getByText('3 changed')).toBeInTheDocument());
    expect(within(row(PATH_B)).getByText('clean')).toBeInTheDocument();
    const prButton = within(row(PATH_B)).getByRole('button', { name: /Open pull request #482/ });
    expect(prButton).toHaveTextContent('#482');
    expect(prButton).toHaveTextContent('1 failing');
    expect(row(PATH_A).querySelector('[data-worktree-pr]')).toBeNull();
  });

  it('opens the linked pull request with showPr and stays in the section', async () => {
    await renderSection();
    fireEvent.click(within(row(PATH_B)).getByRole('button', { name: /Open pull request #482/ }));
    expect(showPr).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      number: 482,
      keepSection: true,
    });
  });

  it('shows the changes of a selected worktree beside the list', async () => {
    await renderSection();
    expect(document.querySelector('[data-worktree-changes-panel]')).toBeNull();

    await act(async () => {
      fireEvent.click(row(PATH_A).querySelector('[data-worktree-open]')!);
    });

    const pane = await screen.findByRole('complementary', { name: 'Changes in fix/login' });
    expect(pane).toHaveAttribute('data-worktree-changes-for', PATH_A);
    expect(row(PATH_A)).toHaveAttribute('data-selected', 'true');
    expect(row(PATH_A)).toHaveAttribute('data-open', 'true');
    expect(invoke).toHaveBeenCalledWith('list_worktree_changes', { worktreePath: PATH_A });
    expect(await within(pane).findByText('src/login.ts')).toBeInTheDocument();

    fireEvent.click(within(pane).getByRole('button', { name: 'Close changes' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('moves with J/K, opens changes with Enter and closes them with Esc', async () => {
    await renderSection();
    expect(selectedPath()).toBeNull();

    press('j');
    expect(selectedPath()).toBe(BASE);
    press('ArrowDown');
    press('j');
    expect(selectedPath()).toBe(PATH_B);
    press('k');
    expect(selectedPath()).toBe(PATH_A);

    await act(async () => {
      press('Enter');
    });
    expect(await screen.findByRole('complementary', { name: 'Changes in fix/login' })).toBeTruthy();

    press('Escape');
    expect(screen.queryByRole('complementary')).toBeNull();
    press('Escape');
    expect(selectedPath()).toBeNull();
  });

  it('opens a terminal with O, T3 with T and toggles the favourite with F', async () => {
    await renderSection();
    press('j');
    press('j');
    press('j'); // feature/482

    press('o');
    expect(invoke).toHaveBeenCalledWith('open_in_terminal', { path: PATH_B });

    await act(async () => {
      press('t');
    });
    expect(invoke).toHaveBeenCalledWith(
      't3_open_thread',
      expect.objectContaining({ workspaceRoot: PATH_B, branch: 'feature/482', prNumber: 482 }),
    );

    await act(async () => {
      press('f');
    });
    await waitFor(() => {
      const call = invoke.mock.calls.find((c) => c[0] === 'save_settings');
      const repos = (call?.[1] as { settings: AppSettings } | undefined)?.settings.repos;
      expect(repos?.[0]?.favoriteWorktreePaths).toEqual([PATH_B]);
    });
    // Opened once, so the meta line now says when.
    expect(within(row(PATH_B)).getByText(/used just now/)).toBeInTheDocument();
  });

  it('leaves the keys alone while typing in the search box or under a detail view', async () => {
    await renderSection();
    const search = screen.getByRole('textbox', { name: 'Filter worktrees' });
    press('j', search);
    expect(selectedPath()).toBeNull();

    useUiStore.setState({
      viewStack: [{ kind: 'list' }, { kind: 'pr-detail', owner: 'org', repo: 'repo', number: 482 }],
    });
    press('j');
    expect(selectedPath()).toBeNull();
    press('o');
    expect(invoke).not.toHaveBeenCalledWith('open_in_terminal', expect.anything());
  });

  it('opens the row reached with Tab on Enter, not the one J/K selected', async () => {
    await renderSection();
    press('j');
    press('j');
    press('j');
    expect(selectedPath()).toBe(PATH_B);

    const bodyA = row(PATH_A).querySelector<HTMLElement>('[data-worktree-open]')!;
    act(() => bodyA.focus());
    // Tab focus selects the row it lands on.
    expect(selectedPath()).toBe(PATH_A);

    // Enter on the focused row is the button's own: the list does not claim
    // (or prevent) it, so the native click opens that row.
    const notPrevented = fireEvent.keyDown(bodyA, { key: 'Enter' });
    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('complementary')).toBeNull();
    await act(async () => {
      fireEvent.click(bodyA);
    });
    expect(await screen.findByRole('complementary', { name: 'Changes in fix/login' })).toBeTruthy();
  });

  it('scans working-tree states once per visit and again on a refresh', async () => {
    await renderSection();
    await waitFor(() => expect(within(row(PATH_A)).getByText('3 changed')).toBeInTheDocument());
    // Let the background revalidation after mount land.
    await waitFor(() =>
      expect(invoke.mock.calls.filter((c) => c[0] === 'worktree_cache_refresh')).toHaveLength(1),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const scans = () => invoke.mock.calls.filter((c) => c[0] === 'list_worktrees').length;
    expect(scans()).toBe(1);

    await act(async () => {
      fireEvent.click(screen.getByTitle('Refresh'));
    });
    await waitFor(() => expect(scans()).toBe(2));
  });

  it('re-reads last-used times written by another window', async () => {
    await renderSection();
    expect(within(row(PATH_A)).queryByText(/used/)).toBeNull();

    localStorage.setItem('borgdock-worktree-last-used', JSON.stringify({ [PATH_A]: Date.now() }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'borgdock-worktree-last-used' }));
    });
    expect(within(row(PATH_A)).getByText(/used just now/)).toBeInTheDocument();
  });

  it('names its keys for the status bar', () => {
    expect(WORKTREES_STATUS_HINT).toContain('Enter changes');
    expect(WORKTREES_STATUS_HINT).toContain('T T3');
  });
});
