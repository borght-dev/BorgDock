import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGitHubRateLimit, useGitHubRateLimit } from '../rate-limit';

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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses both REST and GraphQL pools from the rate_limit response', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          resources: {
            core: { used: 123, limit: 5000, reset: 1717000000 },
            graphql: { used: 42, limit: 5000, reset: 1717000600 },
          },
        }),
        { status: 200 },
      ),
    );
    const rl = await fetchGitHubRateLimit('token');
    expect(rl).toEqual({
      rest: { used: 123, limit: 5000, resetAt: 1717000000 },
      graphql: { used: 42, limit: 5000, resetAt: 1717000600 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/rate_limit',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('defaults a missing graphql resource to zero usage', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ resources: { core: { used: 9, limit: 5000, reset: 1717000000 } } }),
        { status: 200 },
      ),
    );
    const rl = await fetchGitHubRateLimit('token');
    expect(rl.graphql).toEqual({ used: 0, limit: 5000, resetAt: 0 });
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(fetchGitHubRateLimit('token')).rejects.toThrow(/403/);
  });
});

describe('useGitHubRateLimit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null initially, then the parsed rate limit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          resources: {
            core: { used: 10, limit: 5000, reset: 1717000000 },
            graphql: { used: 3, limit: 5000, reset: 1717000300 },
          },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useGitHubRateLimit(60000));
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current).toEqual({
        rest: { used: 10, limit: 5000, resetAt: 1717000000 },
        graphql: { used: 3, limit: 5000, resetAt: 1717000300 },
      });
    });
  });
});
