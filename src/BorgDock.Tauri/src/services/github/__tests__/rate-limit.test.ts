import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGitHubRateLimit, fetchGitHubRateLimit } from '../rate-limit';

vi.mock('../auth', () => ({
  getGitHubToken: vi.fn().mockResolvedValue('fake-token'),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (sel: any) => sel({ settings: { gitHub: { personalAccessToken: undefined } } }),
    { getState: () => ({ settings: { gitHub: { personalAccessToken: undefined } } }) },
  ),
}));

describe('fetchGitHubRateLimit', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('parses GitHub rate_limit response', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resources: { core: { used: 123, limit: 5000, reset: 1717000000 } } }),
        { status: 200 },
      ),
    );
    const rl = await fetchGitHubRateLimit('token');
    expect(rl).toEqual({ used: 123, limit: 5000, resetAt: 1717000000 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/rate_limit',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );
    await expect(fetchGitHubRateLimit('token')).rejects.toThrow(/403/);
  });
});

describe('useGitHubRateLimit', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns null initially, then the parsed rate limit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resources: { core: { used: 10, limit: 5000, reset: 1717000000 } } }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useGitHubRateLimit(60000));
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current).toEqual({ used: 10, limit: 5000, resetAt: 1717000000 });
    });
  });
});
