import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContentSearch } from '../use-content-search';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useContentSearch', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args: { pattern?: string }) => {
      if (cmd === 'search_content') {
        return Promise.resolve([
          { rel_path: 'src/a.ts', match_count: 2, matches: [{ line: 3, preview: args?.pattern ?? '' }] },
        ]);
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('returns empty results for empty query', async () => {
    const { result } = renderHook(() => useContentSearch('/r', ''));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.results).toEqual([]);
  });

  it('debounces then queries the backend', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    const { result, rerender } = renderHook(({ q }: { q: string }) => useContentSearch('/r', q), {
      initialProps: { q: '' },
    });
    rerender({ q: 'foo' });
    expect(mock).not.toHaveBeenCalledWith('search_content', expect.anything());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0));
    expect(mock).toHaveBeenCalledWith(
      'search_content',
      expect.objectContaining({ root: '/r', pattern: 'foo' }),
    );
  });

  it('ignores stale responses when query changes mid-flight', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    const deferreds: Array<{ resolve: (v: unknown) => void }> = [];
    mock.mockReset();
    mock.mockImplementation(() => {
      return new Promise((resolve) => deferreds.push({ resolve }));
    });
    const { result, rerender } = renderHook(({ q }: { q: string }) => useContentSearch('/r', q), {
      initialProps: { q: 'foo' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ q: 'bar' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    // Resolve the first (stale) call last — it should be ignored.
    deferreds[1]!.resolve([{ rel_path: 'bar-result.ts', match_count: 1, matches: [] }]);
    deferreds[0]!.resolve([{ rel_path: 'foo-result.ts', match_count: 1, matches: [] }]);
    await waitFor(() =>
      expect(result.current.results.map((r) => r.rel_path)).toEqual(['bar-result.ts']),
    );
  });
});
