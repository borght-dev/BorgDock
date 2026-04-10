import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useCachedTabData } from '../useCachedTabData';

describe('useCachedTabData', () => {
  const defaultArgs = {
    repoOwner: 'owner',
    repoName: 'repo',
    prNumber: 42,
    dataType: 'commits' as const,
    prUpdatedAt: '2024-06-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state when cache is empty and fetch is pending', async () => {
    // Cache miss
    mockInvoke.mockResolvedValueOnce(null);

    const fetchFn = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.isRefreshing).toBe(false);
  });

  it('returns cached data immediately on cache hit', async () => {
    const cachedCommits = [{ sha: 'abc123', message: 'fix bug' }];
    const now = Math.floor(Date.now() / 1000);

    // Cache hit — fresh data (same prUpdatedAt, recent timestamp)
    mockInvoke.mockResolvedValueOnce({
      data: cachedCommits,
      prUpdatedAt: defaultArgs.prUpdatedAt,
      cachedAt: String(now),
    });

    const fetchFn = vi.fn().mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(cachedCommits);
    });

    // Not loading (cache was hit)
    expect(result.current.isLoading).toBe(false);
    // Not refreshing (cache is fresh)
    expect(result.current.isRefreshing).toBe(false);
    // fetchFn should NOT have been called (cache was fresh)
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('shows cached data and refreshes in background when cache is stale (prUpdatedAt changed)', async () => {
    const cachedCommits = [{ sha: 'old', message: 'old commit' }];
    const freshCommits = [{ sha: 'new', message: 'new commit' }];
    const now = Math.floor(Date.now() / 1000);

    // Cache hit — but stale (different prUpdatedAt)
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') {
        return {
          data: cachedCommits,
          prUpdatedAt: '2024-05-01T00:00:00Z', // older than current
          cachedAt: String(now),
        };
      }
      // cache_save_tab_data — fire and forget
      return undefined;
    });

    // Use a deferred promise so we can observe the cached state before fetch resolves
    let resolveFetch!: (v: unknown) => void;
    const fetchFn = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    // Should show cached data while fetch is still pending
    await waitFor(() => {
      expect(result.current.data).toEqual(cachedCommits);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isRefreshing).toBe(true);
    });

    // Now resolve the fetch
    await act(async () => {
      resolveFetch(freshCommits);
    });

    // Should update to fresh data
    await waitFor(() => {
      expect(result.current.data).toEqual(freshCommits);
      expect(result.current.isRefreshing).toBe(false);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes when cache is older than 5 minutes even if prUpdatedAt matches', async () => {
    const cachedCommits = [{ sha: 'cached' }];
    const freshCommits = [{ sha: 'fresh' }];
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 6 * 60;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') {
        return {
          data: cachedCommits,
          prUpdatedAt: defaultArgs.prUpdatedAt, // same
          cachedAt: String(sixMinutesAgo), // but old
        };
      }
      return undefined;
    });

    let resolveFetch!: (v: unknown) => void;
    const fetchFn = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    // Cached data shown while fetch pending
    await waitFor(() => {
      expect(result.current.data).toEqual(cachedCommits);
      expect(result.current.isRefreshing).toBe(true);
    });

    // Resolve fetch
    await act(async () => {
      resolveFetch(freshCommits);
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(freshCommits);
      expect(result.current.isRefreshing).toBe(false);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetches from API when cache is empty and saves result', async () => {
    const freshData = [{ sha: 'abc' }];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') return null; // cache miss
      return undefined; // save succeeds
    });

    const fetchFn = vi.fn().mockResolvedValue(freshData);

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(freshData);
    });
    expect(result.current.isLoading).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Verify it saved to cache
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cache_save_tab_data', {
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        dataType: 'commits',
        jsonData: freshData,
        prUpdatedAt: defaultArgs.prUpdatedAt,
      });
    });
  });

  it('keeps cached data visible when API fetch fails', async () => {
    const cachedData = [{ sha: 'cached' }];
    const now = Math.floor(Date.now() / 1000);

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') {
        return {
          data: cachedData,
          prUpdatedAt: '2024-05-01T00:00:00Z', // stale
          cachedAt: String(now),
        };
      }
      return undefined;
    });

    let rejectFetch!: (e: Error) => void;
    const fetchFn = vi.fn().mockReturnValue(
      new Promise((_, reject) => { rejectFetch = reject; }),
    );

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    // Cached data shown while fetch pending
    await waitFor(() => {
      expect(result.current.data).toEqual(cachedData);
      expect(result.current.isRefreshing).toBe(true);
    });

    // Reject the fetch
    await act(async () => {
      rejectFetch(new Error('network error'));
    });

    // Cached data should remain visible after fetch fails
    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false);
    });
    expect(result.current.data).toEqual(cachedData);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles cache load failure gracefully (falls through to API)', async () => {
    const freshData = [{ sha: 'fresh' }];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') throw new Error('db corrupted');
      return undefined;
    });

    const fetchFn = vi.fn().mockResolvedValue(freshData);

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(freshData);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('cancels in-flight fetch when unmounted', async () => {
    mockInvoke.mockResolvedValueOnce(null); // cache miss

    let resolveInner: (v: unknown) => void;
    const fetchFn = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveInner = resolve;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        defaultArgs.dataType,
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    expect(result.current.isLoading).toBe(true);

    // Unmount before fetch resolves
    unmount();

    // Resolve after unmount — should not update state (no act warning)
    await act(async () => {
      resolveInner!([{ sha: 'late' }]);
    });
  });

  it('works with different data types', async () => {
    const filesData = [{ filename: 'src/index.ts', status: 'modified' }];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_tab_data') return null;
      return undefined;
    });

    const fetchFn = vi.fn().mockResolvedValue(filesData);

    const { result } = renderHook(() =>
      useCachedTabData(
        defaultArgs.repoOwner,
        defaultArgs.repoName,
        defaultArgs.prNumber,
        'files',
        defaultArgs.prUpdatedAt,
        fetchFn,
      ),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(filesData);
    });

    // Verify correct dataType passed to cache
    expect(mockInvoke).toHaveBeenCalledWith('cache_load_tab_data', expect.objectContaining({
      dataType: 'files',
    }));
  });
});
