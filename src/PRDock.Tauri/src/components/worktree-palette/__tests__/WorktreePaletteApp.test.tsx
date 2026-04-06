import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorktreePaletteApp } from '../WorktreePaletteApp';

const mockClose = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: mockClose,
  })),
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
      if (cmd === 'list_worktrees') {
        return Promise.resolve([
          {
            path: '/home/user/repo/.worktrees/feature-a',
            branchName: 'feature-a',
            isMainWorktree: false,
            status: 'clean' as const,
            uncommittedCount: 0,
            ahead: 1,
            behind: 0,
            commitSha: 'abc123',
          },
          {
            path: '/home/user/repo/.worktrees/feature-b',
            branchName: 'feature-b',
            isMainWorktree: false,
            status: 'dirty' as const,
            uncommittedCount: 3,
            ahead: 0,
            behind: 2,
            commitSha: 'def456',
          },
          {
            path: '/home/user/repo',
            branchName: 'main',
            isMainWorktree: true,
            status: 'clean' as const,
            uncommittedCount: 0,
            ahead: 0,
            behind: 0,
            commitSha: 'main123',
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

  it('displays worktree count', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const countBadge = document.querySelector('.wt-count');
    expect(countBadge?.textContent).toBe('2');
  });

  it('renders worktree branches (excludes main)', async () => {
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
    expect(branchTexts).not.toContain('main');
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

  it('renders sync badges for ahead/behind/dirty', async () => {
    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // feature-a has ahead: 1
    expect(screen.getByText(/\u21911/)).toBeTruthy();
    // feature-b has behind: 2
    expect(screen.getByText(/\u21932/)).toBeTruthy();
    // feature-b has uncommittedCount: 3
    expect(screen.getByText('3M')).toBeTruthy();
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

  it('opens terminal on Enter key', async () => {
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
      path: '/home/user/repo/.worktrees/feature-a',
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
      (c: string[]) => c[0] === 'list_worktrees',
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

    expect(screen.getByText('No repos with worktree paths configured')).toBeTruthy();
  });

  it('opens folder via openPath', async () => {
    const { openPath } = await import('@tauri-apps/plugin-opener');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const folderBtns = document.querySelectorAll('[title="Open folder"]');
    if (folderBtns[0]) {
      await act(async () => {
        fireEvent.click(folderBtns[0]!);
      });
    }

    expect(openPath).toHaveBeenCalledWith('/home/user/repo/.worktrees/feature-a');
  });

  it('opens editor via invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<WorktreePaletteApp />);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const editorBtns = document.querySelectorAll('[title="Open in editor"]');
    if (editorBtns[0]) {
      await act(async () => {
        fireEvent.click(editorBtns[0]!);
      });
    }

    expect(invoke).toHaveBeenCalledWith('open_in_editor', {
      path: '/home/user/repo/.worktrees/feature-a',
    });
  });
});
