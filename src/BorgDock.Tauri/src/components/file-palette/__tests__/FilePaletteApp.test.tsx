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
  });

  it('renders roots and the file index after settings load', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeTruthy());
  });

  it('arrow-down moves selection', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('src/auth/login.tsx')).toBeTruthy());
    const root = screen.getAllByText('FILES')[0]!.closest('.bd-fp-root')!;
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
});
