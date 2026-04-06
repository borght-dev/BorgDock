import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useCacheInit } from '../useCacheInit';

describe('useCacheInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls invoke("cache_init") on mount', async () => {
    mockInvoke.mockResolvedValue(undefined);

    renderHook(() => useCacheInit());

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cache_init');
    });
  });

  it('calls cache_init only once', async () => {
    mockInvoke.mockResolvedValue(undefined);

    const { rerender } = renderHook(() => useCacheInit());

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    rerender();

    // Still only called once because effect deps are []
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('logs error when cache_init fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error('cache failure'));

    renderHook(() => useCacheInit());

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize cache:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('does not throw when cache_init rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error('boom'));

    // Should not throw
    expect(() => renderHook(() => useCacheInit())).not.toThrow();

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cache_init');
    });

    vi.restoreAllMocks();
  });
});
