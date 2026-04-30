import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePaletteApp } from '../FilePaletteApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(() => Promise.resolve()),
    onFocusChanged: vi.fn(() => Promise.resolve(() => {})),
  })),
}));
vi.mock('../use-background-indexer', () => ({
  useBackgroundIndexer: () => ({ entries: [], processed: 0, total: 0, indexing: false }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

describe('FilePaletteApp', () => {
  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
          ui: {},
          filePaletteRoots: [],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
      }
      if (cmd === 'list_root_files') {
        return Promise.resolve({
          entries: [
            { rel_path: 'src/app.ts', size: 10 },
            { rel_path: 'src/auth/login.tsx', size: 20 },
          ],
          truncated: false,
        });
      }
      if (cmd === 'save_settings') return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
    const { open } = await import('@tauri-apps/plugin-dialog');
    (open as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders roots and the file index after settings load', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeTruthy());
  });

  it('arrow-down moves selection', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('src/auth/login.tsx')).toBeTruthy());
    const root = document.querySelector('.bd-fp-root')!;
    await act(async () => {
      fireEvent.keyDown(root, { key: 'ArrowDown' });
    });
    const second = screen.getByText('src/auth/login.tsx').closest('[data-file-result]');
    expect(second?.getAttribute('data-selected')).toBe('true');
  });

  it('typing filters the file list', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeTruthy());
    const input = screen.getByLabelText('File palette search') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'login' } });
    });
    await waitFor(() => {
      expect(screen.queryByText('src/app.ts')).toBeNull();
      expect(screen.getByText('src/auth/login.tsx')).toBeTruthy();
    });
  });

  it('outer container carries data-window="palette"', async () => {
    render(<FilePaletteApp />);
    // The outer div is rendered synchronously even before the first invoke resolves
    expect(document.querySelector('[data-window="palette"]')).not.toBeNull();
  });

  it('clicking + adds the picked folder and makes it active', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { open } = await import('@tauri-apps/plugin-dialog');
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/some/new/scratch');

    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

    const addBtn = screen.getByLabelText('Add custom path…');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      const saves = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([cmd]) => cmd === 'save_settings',
      );
      // First save adds the new root; second save (from selectRoot) sets it active.
      expect(saves.length).toBeGreaterThanOrEqual(2);
      const firstSaveArgs = saves[0]![1];
      expect(firstSaveArgs.settings.filePaletteRoots).toEqual([{ path: '/some/new/scratch' }]);
      const lastSaveArgs = saves[saves.length - 1]![1];
      expect(lastSaveArgs.settings.ui.filePaletteActiveRootPath).toBe('/some/new/scratch');
    });
  });

  it('does not add a path that is already an existing worktree', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { open } = await import('@tauri-apps/plugin-dialog');
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/repo/.worktrees/wt1');

    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

    const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add custom path…'));
    });
    // Allow the picker promise + dedup short-circuit to run.
    await new Promise((r) => setTimeout(r, 30));

    const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;
    expect(afterCount).toBe(beforeCount);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not add a path that is already a custom root', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    // Override load_settings for this test only — start with one custom root.
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
          ui: {},
          filePaletteRoots: [{ path: '/my/scratch' }],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
      }
      if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
      if (cmd === 'save_settings') return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    const { open } = await import('@tauri-apps/plugin-dialog');
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/my/scratch');

    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('scratch')).toBeTruthy());

    const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add custom path…'));
    });
    await new Promise((r) => setTimeout(r, 30));

    const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;
    expect(afterCount).toBe(beforeCount);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not save when the picker is cancelled', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { open } = await import('@tauri-apps/plugin-dialog');
    (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

    const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add custom path…'));
    });
    await new Promise((r) => setTimeout(r, 30));

    const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    ).length;
    expect(afterCount).toBe(beforeCount);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('clicking × on a custom row removes it from filePaletteRoots', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
          ui: {},
          filePaletteRoots: [{ path: '/my/scratch' }],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
      }
      if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
      if (cmd === 'save_settings') return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('scratch')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove custom path'));
    });

    await waitFor(() => {
      const saves = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([cmd, a]) =>
          cmd === 'save_settings' &&
          Array.isArray((a as { settings?: { filePaletteRoots?: unknown } }).settings?.filePaletteRoots),
      );
      expect(saves.length).toBeGreaterThanOrEqual(1);
      const last = saves[saves.length - 1]![1];
      expect(last.settings.filePaletteRoots).toEqual([]);
    });
  });

  it('removing the active custom root falls back to the first remaining root', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
          ui: { filePaletteActiveRootPath: '/my/scratch' },
          filePaletteRoots: [{ path: '/my/scratch' }],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
      }
      if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
      if (cmd === 'save_settings') return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<FilePaletteApp />);
    // Custom root starts active.
    await waitFor(() => {
      const row = screen.getByText('scratch').closest('.bd-fp-root-row-wrap');
      expect(row?.className).toContain('bd-fp-root-row-wrap--active');
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove custom path'));
    });

    // After remove: scratch row is gone, wt1 row is active.
    await waitFor(() => {
      expect(screen.queryByText('scratch')).toBeNull();
      const wt = screen.getByText('wt1').closest('.bd-fp-root-row-wrap');
      expect(wt?.className).toContain('bd-fp-root-row-wrap--active');
    });
  });
});
