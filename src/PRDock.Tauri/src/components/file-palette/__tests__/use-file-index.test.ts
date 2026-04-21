import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileIndex } from '../use-file-index';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useFileIndex', () => {
  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'list_root_files') {
        return Promise.resolve({
          entries: [
            { rel_path: 'src/app.ts', size: 10 },
            { rel_path: 'src/auth/login.tsx', size: 20 },
            { rel_path: 'README.md', size: 30 },
          ],
          truncated: false,
        });
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('returns [] while loading, then the index', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.rel_path)).toEqual([
      'src/app.ts',
      'src/auth/login.tsx',
      'README.md',
    ]);
  });

  it('filters by substring case-insensitively', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const hits = result.current.filter('LOGIN');
    expect(hits.map((h) => h.rel_path)).toEqual(['src/auth/login.tsx']);
  });

  it('returns all entries on empty filter', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filter('')).toHaveLength(3);
  });

  it('refreshes on refresh()', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    mock.mockClear();
    await act(async () => {
      await result.current.refresh();
    });
    expect(mock).toHaveBeenCalledWith('list_root_files', { root: '/repo', limit: undefined });
  });
});
