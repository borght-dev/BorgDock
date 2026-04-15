import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchContributorWeights,
  getCachedWeights,
  startDailyRefresh,
  stopDailyRefresh,
} from '@/services/contributor-stats';

// ---------------------------------------------------------------------------
// Mock GitHubClient
// ---------------------------------------------------------------------------

function makeClient(responses: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async <T>(path: string): Promise<T> => {
      if (path in responses) return responses[path] as T;
      return [] as T;
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  stopDailyRefresh();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// fetchContributorWeights
// ---------------------------------------------------------------------------

describe('fetchContributorWeights', () => {
  it('returns weight 1.0 when user is the top contributor', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [
        { author: { login: 'alice' }, total: 100 },
        { author: { login: 'bob' }, total: 50 },
      ],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('returns normalized weight when user is not top contributor', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [
        { author: { login: 'alice' }, total: 100 },
        { author: { login: 'bob' }, total: 50 },
      ],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'bob',
    );
    expect(weights.get('org/repo')).toBe(0.5);
  });

  it('returns 0 when user has no commits', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [{ author: { login: 'alice' }, total: 100 }],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'bob',
    );
    expect(weights.get('org/repo')).toBe(0);
  });

  it('returns 1.0 when stats response is not an array', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': { message: 'computing' },
    });

    const promise = fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );

    // Advance through 3 retry delays (fetchWithRetry retries 3 times with 1s delays)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const weights = await promise;
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('returns 1.0 when API throws', async () => {
    const client = {
      get: vi.fn(async () => {
        throw new Error('API error');
      }),
    };

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('returns 1.0 when maxCommits is 0 (empty stats array)', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('handles multiple repos', async () => {
    const client = makeClient({
      'repos/org/repo1/stats/contributors': [{ author: { login: 'alice' }, total: 100 }],
      'repos/org/repo2/stats/contributors': [
        { author: { login: 'alice' }, total: 50 },
        { author: { login: 'bob' }, total: 200 },
      ],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [
        { owner: 'org', name: 'repo1' },
        { owner: 'org', name: 'repo2' },
      ],
      'alice',
    );
    expect(weights.get('org/repo1')).toBe(1.0);
    expect(weights.get('org/repo2')).toBe(0.25); // 50/200
  });

  it('is case-insensitive for username matching', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [{ author: { login: 'Alice' }, total: 100 }],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('retries when stats are computing (object response)', async () => {
    let callCount = 0;
    const client = {
      get: vi.fn(async () => {
        callCount++;
        if (callCount <= 2) return { message: 'still computing' }; // non-array object
        return [{ author: { login: 'alice' }, total: 10 }];
      }),
    };

    const promise = fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );

    // Advance through the setTimeout delays in fetchWithRetry
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const weights = await promise;
    expect(weights.get('org/repo')).toBe(1.0);
    expect(callCount).toBe(3);
  });

  it('returns empty array after exhausting retries on non-array responses', async () => {
    const client = {
      get: vi.fn(async () => ({ message: 'still computing' })),
    };

    const promise = fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );

    // Advance past all 3 retry delays
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const weights = await promise;
    // After 3 retries returning objects, fetchWithRetry returns [] which is an array
    // but empty, so maxCommits=0 -> weight=1.0
    expect(weights.get('org/repo')).toBe(1.0);
  });

  it('handles stat entries with missing author', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [
        { author: null, total: 100 },
        { author: { login: 'alice' }, total: 50 },
      ],
    });

    const weights = await fetchContributorWeights(
      client as never,
      [{ owner: 'org', name: 'repo' }],
      'alice',
    );
    // maxCommits = 100 (from null-author entry), userCommits = 50
    expect(weights.get('org/repo')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// getCachedWeights
// ---------------------------------------------------------------------------

describe('getCachedWeights', () => {
  it('returns the cache populated by fetchContributorWeights', async () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [{ author: { login: 'alice' }, total: 100 }],
    });

    await fetchContributorWeights(client as never, [{ owner: 'org', name: 'repo' }], 'alice');

    const cached = getCachedWeights();
    expect(cached.get('org/repo')).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// startDailyRefresh / stopDailyRefresh
// ---------------------------------------------------------------------------

describe('startDailyRefresh / stopDailyRefresh', () => {
  it('starts a 24h interval that calls fetchContributorWeights', () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [{ author: { login: 'alice' }, total: 100 }],
    });

    startDailyRefresh(client as never, [{ owner: 'org', name: 'repo' }], 'alice');

    expect(client.get).not.toHaveBeenCalled();

    // Advance 24 hours
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('stopDailyRefresh stops the interval', () => {
    const client = makeClient({
      'repos/org/repo/stats/contributors': [],
    });

    startDailyRefresh(client as never, [{ owner: 'org', name: 'repo' }], 'alice');

    stopDailyRefresh();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('calling startDailyRefresh twice replaces the previous interval', () => {
    const client1 = makeClient({ 'repos/org/repo/stats/contributors': [] });
    const client2 = makeClient({ 'repos/org/repo/stats/contributors': [] });

    startDailyRefresh(client1 as never, [{ owner: 'org', name: 'repo' }], 'alice');
    startDailyRefresh(client2 as never, [{ owner: 'org', name: 'repo' }], 'bob');

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    // Only the second client should be called
    expect(client1.get).not.toHaveBeenCalled();
    expect(client2.get).toHaveBeenCalled();
  });

  it('stopDailyRefresh is safe to call when no timer is active', () => {
    expect(() => stopDailyRefresh()).not.toThrow();
  });
});
