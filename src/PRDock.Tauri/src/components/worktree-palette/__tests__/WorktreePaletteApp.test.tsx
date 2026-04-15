import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreePaletteApp } from '../WorktreePaletteApp';

const mockClose = vi.fn(() => Promise.resolve());
const mockSetSize = vi.fn(() => Promise.resolve());
const mockInnerSize = vi.fn(() => Promise.resolve({ width: 520, height: 420 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: mockClose,
    setSize: mockSetSize,
    innerSize: mockInnerSize,
    scaleFactor: mockScaleFactor,
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

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(() => Promise.resolve()),
}));

describe('WorktreePaletteApp', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [
            {
              owner: 'org',
              name: 'repo',
              enabled: true,
              worktreeBasePath: '/home/user/repo',
              worktreeSubfolder: '.worktrees',
            },
          ],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([
          {
            path: '/home/user/repo/.worktrees/feature-a',
            branchName: 'feature-a',
            isMainWorktree: false,
          },
          {
            path: '/home/user/repo/.worktrees/feature-b',
            branchName: 'feature-b',
            isMainWorktree: false,
          },
          {
            path: '/home/user/repo',
            branchName: 'main',
            isMainWorktree: true,
          },
        ]);
      }
      if (cmd === 'open_in_terminal') return Promise.resolve();
      if (cmd === 'open_in_editor') return Promise.resolve();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the title', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('WORKTREES')).toBeTruthy();
  });

  it('shows loading state initially', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<WorktreePaletteApp />);
    });

    expect(screen.getByText('Scanning worktrees...')).toBeTruthy();
  });

  it('displays worktree count (including main)', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const countBadge = document.querySelector('.wt-count');
    expect(countBadge?.textContent).toBe('3');
  });

  it('renders all worktree branches including main as the repo anchor', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const branches = document.querySelectorAll('.wt-branch');
    const branchTexts = Array.from(branches).map((b) => b.textContent);
    expect(branchTexts).toContain('feature-a');
    expect(branchTexts).toContain('feature-b');
    expect(branchTexts).toContain('main');

    // Main should be pinned to the top of the repo group
    expect(branchTexts[0]).toBe('main');
    // And flagged with the MAIN badge
    expect(document.querySelector('.wt-main-badge')).toBeTruthy();
  });

  it('renders repo group header', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('org/repo')).toBeTruthy();
  });

  it('shows search input after loading', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByPlaceholderText('Filter by branch, folder, or repo...')).toBeTruthy();
  });

  it('filters worktrees by search query', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const input = screen.getByPlaceholderText('Filter by branch, folder, or repo...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'feature-a' } });
    });

    const branches = document.querySelectorAll('.wt-branch');
    const branchTexts = Array.from(branches).map((b) => b.textContent);
    expect(branchTexts).toContain('feature-a');
    expect(branchTexts).not.toContain('feature-b');
  });

  it('shows no results message when filter matches nothing', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const input = screen.getByPlaceholderText('Filter by branch, folder, or repo...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'nonexistent' } });
    });

    expect(screen.getByText(/No worktrees matching/)).toBeTruthy();
  });

  it('clears search when clear button is clicked', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const input = screen.getByPlaceholderText('Filter by branch, folder, or repo...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'feature-a' } });
    });

    const clearBtn = document.querySelector('.wt-search-clear');
    await act(async () => {
      if (clearBtn) fireEvent.click(clearBtn);
    });

    const branches = document.querySelectorAll('.wt-branch');
    const branchTexts = Array.from(branches).map((b) => b.textContent);
    expect(branchTexts).toContain('feature-a');
    expect(branchTexts).toContain('feature-b');
  });

  it('handles ArrowDown keyboard navigation', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const palette = document.querySelector('.wt-palette');
    if (palette) {
      await act(async () => {
        fireEvent.keyDown(palette, { key: 'ArrowDown' });
      });
    }
  });

  it('handles ArrowUp keyboard navigation', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const palette = document.querySelector('.wt-palette');
    if (palette) {
      await act(async () => {
        fireEvent.keyDown(palette, { key: 'ArrowUp' });
      });
    }
  });

  it('opens terminal on Enter key (on main worktree, since it sorts first)', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const palette = document.querySelector('.wt-palette');
    if (palette) {
      await act(async () => {
        fireEvent.keyDown(palette, { key: 'Enter' });
      });
    }

    expect(invoke).toHaveBeenCalledWith('open_in_terminal', {
      path: '/home/user/repo',
    });
  });

  it('clears query on first Escape, closes window on second', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const input = screen.getByPlaceholderText('Filter by branch, folder, or repo...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    const palette = document.querySelector('.wt-palette');
    if (palette) {
      await act(async () => {
        fireEvent.keyDown(palette, { key: 'Escape' });
      });
      expect((input as HTMLInputElement).value).toBe('');

      await act(async () => {
        fireEvent.keyDown(palette, { key: 'Escape' });
      });
      expect(mockClose).toHaveBeenCalled();
    }
  });

  it('refreshes worktrees on refresh button click', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const refreshBtn = document.querySelector('[title="Refresh"]');
    if (refreshBtn) {
      await act(async () => {
        fireEvent.click(refreshBtn);
      });
    }

    const listCalls = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: string[]) => c[0] === 'list_worktrees_bare',
    );
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('closes window on close button click', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const closeBtn = document.querySelector('[title="Close (Esc)"]');
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }
    expect(mockClose).toHaveBeenCalled();
  });

  it('renders the footer with keyboard shortcuts', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('navigate')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('close')).toBeTruthy();
  });

  it('shows empty state when no repos configured', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({ repos: [] });
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('No worktrees configured')).toBeTruthy();
  });

  it('opens folder via openPath', async () => {
    const { openPath } = await import('@tauri-apps/plugin-opener');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // First folder button corresponds to main (which sorts first).
    const folderBtns = document.querySelectorAll('[title="Open folder"]');
    if (folderBtns[0]) {
      await act(async () => {
        fireEvent.click(folderBtns[0]!);
      });
    }

    expect(openPath).toHaveBeenCalledWith('/home/user/repo');
  });

  it('opens editor via invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // First editor button corresponds to main (which sorts first).
    const editorBtns = document.querySelectorAll('[title="Open in editor"]');
    if (editorBtns[0]) {
      await act(async () => {
        fireEvent.click(editorBtns[0]!);
      });
    }

    expect(invoke).toHaveBeenCalledWith('open_in_editor', {
      path: '/home/user/repo',
    });
  });

  it('renders a star button on non-main rows and hides it on main rows', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // 2 non-main rows → 2 star buttons; main gets a placeholder instead.
    const stars = document.querySelectorAll('.wt-star-btn');
    expect(stars.length).toBe(2);
    const placeholders = document.querySelectorAll('.wt-star-placeholder');
    expect(placeholders.length).toBe(1);
  });

  it('toggling a star saves the updated favoriteWorktreePaths to settings', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as ReturnType<typeof vi.fn>;

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Click the first non-main star (belongs to feature-a since it sorts alphabetically first).
    const firstStar = document.querySelector('.wt-star-btn') as HTMLElement | null;
    expect(firstStar).toBeTruthy();
    await act(async () => {
      if (firstStar) fireEvent.click(firstStar);
    });
    // Give the async save_settings a tick to run
    await act(async () => {
      await Promise.resolve();
    });

    const saveCall = invokeMock.mock.calls.find((c) => c[0] === 'save_settings');
    expect(saveCall).toBeTruthy();
    const savedRepos = (
      saveCall![1] as { settings: { repos: Array<{ favoriteWorktreePaths: string[] }> } }
    ).settings.repos;
    expect(savedRepos[0]!.favoriteWorktreePaths).toContain('/home/user/repo/.worktrees/feature-a');
  });

  it('"Favorites only" toggle hides non-favorites but keeps the main worktree visible', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [
            {
              owner: 'org',
              name: 'repo',
              enabled: true,
              worktreeBasePath: '/home/user/repo',
              worktreeSubfolder: '.worktrees',
              favoriteWorktreePaths: ['/home/user/repo/.worktrees/feature-a'],
            },
          ],
          ui: { worktreePaletteFavoritesOnly: true },
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([
          {
            path: '/home/user/repo/.worktrees/feature-a',
            branchName: 'feature-a',
            isMainWorktree: false,
          },
          {
            path: '/home/user/repo/.worktrees/feature-b',
            branchName: 'feature-b',
            isMainWorktree: false,
          },
          {
            path: '/home/user/repo',
            branchName: 'main',
            isMainWorktree: true,
          },
        ]);
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const branchTexts = Array.from(document.querySelectorAll('.wt-branch')).map(
      (b) => b.textContent,
    );
    // feature-a is starred, main is always visible, feature-b is hidden.
    expect(branchTexts).toContain('feature-a');
    expect(branchTexts).toContain('main');
    expect(branchTexts).not.toContain('feature-b');
  });
});
