import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorktreeSnapshot } from '@/types/worktree';
import { compareFolderNames, WorktreePaletteApp } from '../WorktreePaletteApp';

const mockClose = vi.fn(() => Promise.resolve());
const mockHide = vi.fn(() => Promise.resolve());
const mockSetSize = vi.fn(() => Promise.resolve());
const mockInnerSize = vi.fn(() => Promise.resolve({ width: 520, height: 420 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));

/** Handlers registered via `listen`, keyed by event name. */
const listeners = new Map<string, (event: { payload: unknown }) => void>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, cb: (event: { payload: unknown }) => void) => {
    listeners.set(name, cb);
    return Promise.resolve(() => listeners.delete(name));
  }),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: mockClose,
    hide: mockHide,
    setSize: mockSetSize,
    innerSize: mockInnerSize,
    scaleFactor: mockScaleFactor,
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
  })),
  currentMonitor: vi.fn(() => Promise.resolve({ size: { width: 1920, height: 1080 } })),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

const REPO = { owner: 'org', name: 'repo', basePath: '/home/user/repo' };

function snapshot(entries: WorktreeSnapshot[number]['entries'], error?: string): WorktreeSnapshot {
  return [{ repo: REPO, entries, fetchedAt: 1, error }];
}

const DEFAULT_SNAPSHOT = snapshot([
  { path: '/home/user/repo', branchName: 'main', isMainWorktree: true },
  { path: '/home/user/repo/.worktrees/feature-a', branchName: 'feature-a', isMainWorktree: false },
  { path: '/home/user/repo/.worktrees/feature-b', branchName: 'feature-b', isMainWorktree: false },
]);

const DEFAULT_SETTINGS = {
  repos: [
    {
      owner: 'org',
      name: 'repo',
      enabled: true,
      worktreeBasePath: '/home/user/repo',
      worktreeSubfolder: '.worktrees',
    },
  ],
};

type InvokeMock = ReturnType<typeof vi.fn>;

async function getInvoke(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

function mockCommands(
  invoke: InvokeMock,
  overrides: { settings?: unknown; snapshot?: WorktreeSnapshot; refresh?: WorktreeSnapshot } = {},
) {
  const settings = overrides.settings ?? DEFAULT_SETTINGS;
  const snap = overrides.snapshot ?? DEFAULT_SNAPSHOT;
  const refresh = overrides.refresh ?? snap;
  invoke.mockImplementation((cmd: string) => {
    if (cmd === 'load_settings') return Promise.resolve(settings);
    if (cmd === 'worktree_cache_get_all') return Promise.resolve(snap);
    if (cmd === 'worktree_cache_refresh') return Promise.resolve(refresh);
    return Promise.resolve();
  });
}

async function renderPalette() {
  await act(async () => {
    render(<WorktreePaletteApp />);
  });
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
}

function branchTexts(): (string | null)[] {
  return Array.from(document.querySelectorAll('.bd-wt-branch')).map((b) => b.textContent);
}

describe('WorktreePaletteApp', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    listeners.clear();
    mockCommands(await getInvoke());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the title', async () => {
    await renderPalette();
    expect(screen.getByText('Worktrees')).toBeTruthy();
  });

  it('shows loading state initially', async () => {
    (await getInvoke()).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<WorktreePaletteApp />);
    });

    expect(screen.getByText('Scanning worktrees...')).toBeTruthy();
  });

  it('renders from the cache snapshot without spawning git commands', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const commands = invoke.mock.calls.map((c) => c[0]);
    expect(commands).toContain('worktree_cache_get_all');
    expect(commands).not.toContain('list_worktrees_bare');
    expect(commands).not.toContain('list_worktrees');
  });

  it('reveals the window on mount, then revalidates in the background', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const commands = invoke.mock.calls.map((c) => c[0]);
    const readyIdx = commands.indexOf('window_ready');
    const refreshIdx = commands.indexOf('worktree_cache_refresh');
    expect(readyIdx).toBeGreaterThanOrEqual(0);
    expect(refreshIdx).toBeGreaterThan(readyIdx);
    // The one-time fit happens before reveal; nothing resizes afterwards.
    expect(
      mockSetSize.mock.invocationCallOrder.every(
        (n) => n < invoke.mock.invocationCallOrder[readyIdx]!,
      ),
    ).toBe(true);
  });

  it('reveals the window even when the cache is empty (cold start)', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, { snapshot: [], refresh: DEFAULT_SNAPSHOT });
    await renderPalette();

    expect(invoke).toHaveBeenCalledWith('window_ready');
    // Background refresh then populates the list.
    await waitFor(() => expect(branchTexts()).toContain('feature-a'));
  });

  it('reveals the window even when settings never load', async () => {
    const invoke = await getInvoke();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') return new Promise(() => {});
      if (cmd === 'worktree_cache_get_all') return Promise.resolve(DEFAULT_SNAPSHOT);
      if (cmd === 'worktree_cache_refresh') return Promise.resolve(DEFAULT_SNAPSHOT);
      return Promise.resolve();
    });
    await renderPalette();

    expect(invoke).toHaveBeenCalledWith('window_ready');
    expect(branchTexts()).toContain('feature-a');
  });

  it('renders rows with data-worktree-row + data-tree-path contracts', async () => {
    await renderPalette();

    await waitFor(() => {
      expect(document.querySelectorAll('[data-worktree-row]').length).toBeGreaterThanOrEqual(1);
    });

    const paths = Array.from(document.querySelectorAll('[data-worktree-row]')).map((el) =>
      el.getAttribute('data-tree-path'),
    );
    expect(paths).toContain('/home/user/repo/.worktrees/feature-a');
    expect(paths).toContain('/home/user/repo');
  });

  it('renders all worktree branches including main as the repo anchor', async () => {
    await renderPalette();

    const texts = branchTexts();
    expect(texts).toContain('feature-a');
    expect(texts).toContain('feature-b');
    expect(texts).toContain('main');

    // Main should be pinned to the top of the repo group
    expect(texts[0]).toBe('main');
    // And flagged with the MAIN pill
    expect(screen.getByText(/^main$/i, { selector: '.bd-pill' })).toBeTruthy();
  });

  it('sorts by folder name with numeric ordering (worktree1, worktree2, worktree10)', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, {
      snapshot: snapshot([
        {
          path: '/home/user/repo/.worktrees/worktree10',
          branchName: 'aaa-first-alpha',
          isMainWorktree: false,
        },
        { path: '/home/user/repo/.worktrees/worktree2', branchName: 'zzz', isMainWorktree: false },
        { path: '/home/user/repo', branchName: 'main', isMainWorktree: true },
        { path: '/home/user/repo/.worktrees/worktree1', branchName: 'mmm', isMainWorktree: false },
      ]),
    });
    await renderPalette();

    const paths = Array.from(document.querySelectorAll('[data-worktree-row]')).map((el) =>
      el.getAttribute('data-tree-path'),
    );
    expect(paths).toEqual([
      '/home/user/repo',
      '/home/user/repo/.worktrees/worktree1',
      '/home/user/repo/.worktrees/worktree2',
      '/home/user/repo/.worktrees/worktree10',
    ]);
  });

  it('marks favorites with a star but does not hoist them', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, {
      settings: {
        repos: [
          {
            ...DEFAULT_SETTINGS.repos[0],
            favoriteWorktreePaths: ['/home/user/repo/.worktrees/worktree3'],
          },
        ],
      },
      snapshot: snapshot([
        { path: '/home/user/repo', branchName: 'main', isMainWorktree: true },
        { path: '/home/user/repo/.worktrees/worktree1', branchName: 'a', isMainWorktree: false },
        { path: '/home/user/repo/.worktrees/worktree2', branchName: 'b', isMainWorktree: false },
        { path: '/home/user/repo/.worktrees/worktree3', branchName: 'c', isMainWorktree: false },
      ]),
    });
    await renderPalette();

    const rows = Array.from(document.querySelectorAll('[data-worktree-row]'));
    const paths = rows.map((el) => el.getAttribute('data-tree-path'));
    expect(paths[3]).toBe('/home/user/repo/.worktrees/worktree3');
    const star = rows[3]!.querySelector('[aria-pressed]');
    expect(star?.getAttribute('aria-pressed')).toBe('true');
    expect(rows[1]!.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('merges worktrees-updated broadcasts into the list', async () => {
    await renderPalette();
    expect(listeners.has('worktrees-updated')).toBe(true);

    await act(async () => {
      listeners.get('worktrees-updated')?.({
        payload: snapshot([
          { path: '/home/user/repo', branchName: 'main', isMainWorktree: true },
          {
            path: '/home/user/repo/.worktrees/feature-z',
            branchName: 'feature-z',
            isMainWorktree: false,
          },
        ]),
      });
    });

    const texts = branchTexts();
    expect(texts).toContain('feature-z');
    expect(texts).not.toContain('feature-a');
  });

  it('on palette-shown: refreshes in the background and keeps the current rows', async () => {
    const invoke = await getInvoke();
    let resolveRefresh: (v: WorktreeSnapshot) => void = () => {};
    await renderPalette();
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') return Promise.resolve(DEFAULT_SETTINGS);
      if (cmd === 'worktree_cache_refresh') {
        return new Promise<WorktreeSnapshot>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      return Promise.resolve();
    });

    await act(async () => {
      listeners.get('palette-shown')?.({ payload: undefined });
    });

    // Refresh requested, list untouched while it's in flight.
    expect(invoke).toHaveBeenCalledWith('worktree_cache_refresh');
    expect(branchTexts()).toContain('feature-a');
    expect(screen.queryByText('Scanning worktrees...')).toBeNull();

    await act(async () => {
      resolveRefresh(
        snapshot([{ path: '/home/user/repo', branchName: 'main', isMainWorktree: true }]),
      );
    });
    expect(branchTexts()).not.toContain('feature-a');
  });

  it('shows per-repo errors from the snapshot', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, { snapshot: snapshot([], 'git: not a git repository') });
    await renderPalette();

    expect(screen.getByText('org/repo')).toBeTruthy();
    expect(screen.getByText('git: not a git repository')).toBeTruthy();
    expect(screen.queryByText('No worktrees configured')).toBeNull();
  });

  it('renders repo group header', async () => {
    await renderPalette();
    expect(screen.getByText('org/repo')).toBeTruthy();
  });

  it('labels remote worktrees and does not expose local-only actions', async () => {
    const invoke = await getInvoke();
    const remoteSnapshot: WorktreeSnapshot = [
      {
        repo: {
          owner: 'Gomocha-FSP',
          name: 'fsp-horizon',
          basePath: '/Users/koenvdb/Dev/fsp-horizon',
          remote: {
            id: 'mac-fsp',
            label: 'Mac mini',
            sshTarget: 'koenvdb@100.88.82.41',
          },
        },
        entries: [
          {
            path: '/Users/koenvdb/Dev/fsp-horizon',
            branchName: 'main',
            isMainWorktree: true,
          },
          {
            path: '/Users/koenvdb/Dev/fsp-horizon/.worktrees/worktree1',
            branchName: 'feature/remote',
            isMainWorktree: false,
          },
        ],
        fetchedAt: 1,
      },
    ];
    mockCommands(invoke, {
      settings: {
        repos: [],
        remoteWorktreeRepos: [
          {
            id: 'mac-fsp',
            label: 'Mac mini',
            owner: 'Gomocha-FSP',
            name: 'fsp-horizon',
            sshTarget: 'koenvdb@100.88.82.41',
            identityFile: '',
            basePath: '/Users/koenvdb/Dev/fsp-horizon',
            enabled: true,
          },
        ],
        ui: {},
      },
      snapshot: remoteSnapshot,
      refresh: remoteSnapshot,
    });
    await renderPalette();

    expect(screen.getByText('Mac mini · Gomocha-FSP/fsp-horizon')).toBeTruthy();
    expect(screen.getAllByText('remote')).toHaveLength(2);
    expect(screen.getByText('feature/remote')).toBeTruthy();
    expect(document.querySelectorAll('[data-action="open-terminal"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-worktree-row] [aria-pressed]')).toHaveLength(2);

    const palette = document.querySelector('.bd-wt-palette');
    await act(async () => fireEvent.keyDown(palette!, { key: 'Enter' }));
    expect(invoke).not.toHaveBeenCalledWith('open_in_terminal', expect.anything());
  });

  it('saves favorites on the matching remote repository', async () => {
    const invoke = await getInvoke();
    const remotePath = '/Users/koenvdb/Dev/fsp-horizon/.worktrees/worktree1';
    const remoteSnapshot: WorktreeSnapshot = [
      {
        repo: {
          owner: 'Gomocha-FSP',
          name: 'fsp-horizon',
          basePath: '/Users/koenvdb/Dev/fsp-horizon',
          remote: {
            id: 'mac-fsp',
            label: 'Mac mini',
            sshTarget: 'koenvdb@100.88.82.41',
          },
        },
        entries: [{ path: remotePath, branchName: 'feature/remote', isMainWorktree: false }],
        fetchedAt: 1,
      },
    ];
    mockCommands(invoke, {
      settings: {
        repos: [],
        remoteWorktreeRepos: [
          {
            id: 'mac-fsp',
            label: 'Mac mini',
            owner: 'Gomocha-FSP',
            name: 'fsp-horizon',
            sshTarget: 'koenvdb@100.88.82.41',
            identityFile: '',
            basePath: '/Users/koenvdb/Dev/fsp-horizon',
            enabled: true,
          },
        ],
        ui: {},
      },
      snapshot: remoteSnapshot,
      refresh: remoteSnapshot,
    });
    await renderPalette();

    const star = document.querySelector('[data-worktree-row] [aria-pressed]') as HTMLElement | null;
    expect(star).toBeTruthy();
    await act(async () => {
      fireEvent.click(star!);
      await Promise.resolve();
    });

    const saveCall = invoke.mock.calls.find((call) => call[0] === 'save_settings');
    expect(saveCall).toBeTruthy();
    const savedRemoteRepos = (
      saveCall![1] as {
        settings: { remoteWorktreeRepos: Array<{ favoriteWorktreePaths?: string[] }> };
      }
    ).settings.remoteWorktreeRepos;
    expect(savedRemoteRepos[0]!.favoriteWorktreePaths).toContain(remotePath);
  });

  it('loads remote favorites and filters other remote worktrees in favorites-only mode', async () => {
    const invoke = await getInvoke();
    const favoritePath = '/Users/koenvdb/Dev/fsp-horizon/.worktrees/favorite';
    const otherPath = '/Users/koenvdb/Dev/fsp-horizon/.worktrees/other';
    const remoteSnapshot: WorktreeSnapshot = [
      {
        repo: {
          owner: 'Gomocha-FSP',
          name: 'fsp-horizon',
          basePath: '/Users/koenvdb/Dev/fsp-horizon',
          remote: {
            id: 'mac-fsp',
            label: 'Mac mini',
            sshTarget: 'koenvdb@100.88.82.41',
          },
        },
        entries: [
          { path: favoritePath, branchName: 'feature/favorite', isMainWorktree: false },
          { path: otherPath, branchName: 'feature/other', isMainWorktree: false },
        ],
        fetchedAt: 1,
      },
    ];
    mockCommands(invoke, {
      settings: {
        repos: [],
        remoteWorktreeRepos: [
          {
            id: 'mac-fsp',
            label: 'Mac mini',
            owner: 'Gomocha-FSP',
            name: 'fsp-horizon',
            sshTarget: 'koenvdb@100.88.82.41',
            identityFile: '',
            basePath: '/Users/koenvdb/Dev/fsp-horizon',
            enabled: true,
            favoriteWorktreePaths: [favoritePath],
          },
        ],
        ui: { worktreePaletteFavoritesOnly: true },
      },
      snapshot: remoteSnapshot,
      refresh: remoteSnapshot,
    });
    await renderPalette();

    expect(screen.getByText('feature/favorite')).toBeTruthy();
    expect(screen.queryByText('feature/other')).toBeNull();
    expect(document.querySelector('[data-worktree-row] [aria-pressed="true"]')).toBeTruthy();
  });

  it('shows search input after loading with expected placeholder', async () => {
    await renderPalette();
    expect(screen.getByPlaceholderText(/Filter by branch/i)).toBeTruthy();
  });

  it('filters worktrees by search query', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText(/Filter by branch/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'feature-a' } });
    });

    const texts = branchTexts();
    expect(texts).toContain('feature-a');
    expect(texts).not.toContain('feature-b');
  });

  it('shows no results message when filter matches nothing', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText(/Filter by branch/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'nonexistent' } });
    });

    expect(screen.getByText(/No worktrees matching/)).toBeTruthy();
  });

  it('clears search when clear button is clicked', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText(/Filter by branch/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'feature-a' } });
    });

    const clearBtn = document.querySelector('.bd-wt-search-clear');
    await act(async () => {
      if (clearBtn) fireEvent.click(clearBtn);
    });

    const texts = branchTexts();
    expect(texts).toContain('feature-a');
    expect(texts).toContain('feature-b');
  });

  it('handles ArrowDown / ArrowUp keyboard navigation', async () => {
    await renderPalette();

    const palette = document.querySelector('.bd-wt-palette');
    expect(palette).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(palette!, { key: 'ArrowDown' });
    });
    expect(document.querySelector('.bd-wt-row--selected')?.getAttribute('data-tree-path')).toBe(
      '/home/user/repo/.worktrees/feature-a',
    );
    await act(async () => {
      fireEvent.keyDown(palette!, { key: 'ArrowUp' });
    });
    expect(document.querySelector('.bd-wt-row--selected')?.getAttribute('data-tree-path')).toBe(
      '/home/user/repo',
    );
  });

  it('opens terminal on Enter key (on main worktree, since it sorts first)', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const palette = document.querySelector('.bd-wt-palette');
    await act(async () => {
      fireEvent.keyDown(palette!, { key: 'Enter' });
    });

    expect(invoke).toHaveBeenCalledWith('open_in_terminal', { path: '/home/user/repo' });
  });

  it('clears query on first Escape, hides window on second', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText(/Filter by branch/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    const palette = document.querySelector('.bd-wt-palette');
    await act(async () => {
      fireEvent.keyDown(palette!, { key: 'Escape' });
    });
    expect((input as HTMLInputElement).value).toBe('');

    await act(async () => {
      fireEvent.keyDown(palette!, { key: 'Escape' });
    });
    expect(mockHide).toHaveBeenCalled();
  });

  it('refreshes worktrees via the cache on refresh button click', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const refreshBtn = document.querySelector('[title="Refresh"]');
    expect(refreshBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(refreshBtn!);
    });

    const refreshCalls = invoke.mock.calls.filter((c) => c[0] === 'worktree_cache_refresh');
    // One from the post-reveal background revalidation, one from the click.
    expect(refreshCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('closes window on chrome close button click', async () => {
    await renderPalette();

    const closeBtn = document.querySelector('[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(mockClose).toHaveBeenCalled();
  });

  it('renders the status bar with keyboard hints and worktree counts', async () => {
    await renderPalette();

    expect(screen.getByText(/nav/)).toBeTruthy();
    expect(screen.getByText(/open/)).toBeTruthy();
    expect(screen.getByText(/of \d+ worktrees?/)).toBeTruthy();
  });

  it('shows empty state when no repos configured', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, { settings: { repos: [] }, snapshot: [], refresh: [] });
    await renderPalette();

    expect(screen.getByText('No worktrees configured')).toBeTruthy();
  });

  it('opens folder via reveal_in_file_manager using data-action="open-folder"', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const folderBtns = document.querySelectorAll('[data-action="open-folder"]');
    expect(folderBtns.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(folderBtns[0]!);
    });

    expect(invoke).toHaveBeenCalledWith('reveal_in_file_manager', { path: '/home/user/repo' });
  });

  it('opens editor via invoke using data-action="open-editor"', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const editorBtns = document.querySelectorAll('[data-action="open-editor"]');
    expect(editorBtns.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(editorBtns[0]!);
    });

    expect(invoke).toHaveBeenCalledWith('open_in_editor', { path: '/home/user/repo' });
  });

  it('renders a star button on non-main rows and hides it on main rows', async () => {
    await renderPalette();

    const mainIcons = document.querySelectorAll('.bd-wt-main-icon');
    expect(mainIcons.length).toBe(1);
    const stars = document.querySelectorAll('[data-worktree-row] [aria-pressed]');
    expect(stars.length).toBe(2);
  });

  it('toggling a star saves the updated favoriteWorktreePaths to settings', async () => {
    const invoke = await getInvoke();
    await renderPalette();

    const firstStar = document.querySelector(
      '[data-worktree-row] [aria-pressed]',
    ) as HTMLElement | null;
    expect(firstStar).toBeTruthy();
    await act(async () => {
      fireEvent.click(firstStar!);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const saveCall = invoke.mock.calls.find((c) => c[0] === 'save_settings');
    expect(saveCall).toBeTruthy();
    const savedRepos = (
      saveCall![1] as { settings: { repos: Array<{ favoriteWorktreePaths: string[] }> } }
    ).settings.repos;
    expect(savedRepos[0]!.favoriteWorktreePaths).toContain('/home/user/repo/.worktrees/feature-a');
  });

  it('"Favorites only" toggle hides non-favorites but keeps the main worktree visible', async () => {
    const invoke = await getInvoke();
    mockCommands(invoke, {
      settings: {
        repos: [
          {
            ...DEFAULT_SETTINGS.repos[0],
            favoriteWorktreePaths: ['/home/user/repo/.worktrees/feature-a'],
          },
        ],
        ui: { worktreePaletteFavoritesOnly: true },
      },
    });
    await renderPalette();

    const texts = branchTexts();
    expect(texts).toContain('feature-a');
    expect(texts).toContain('main');
    expect(texts).not.toContain('feature-b');
  });
});

describe('compareFolderNames', () => {
  it('orders numerically and case-insensitively', () => {
    const sorted = ['worktree10', 'Worktree2', 'worktree1', 'alpha'].sort(compareFolderNames);
    expect(sorted).toEqual(['alpha', 'worktree1', 'Worktree2', 'worktree10']);
  });
});
