import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import type { GitHubClient } from '../github/client';
import { getPRFiles, getPRReviewDetails } from '../github/pulls';
import { loadCachedReviewSnapshot } from '../quick-review';

vi.mock('../github/pulls', () => ({ getPRFiles: vi.fn(), getPRReviewDetails: vi.fn() }));

describe('Review snapshot preloading', () => {
  let client: GitHubClient;
  const pr = makePr({ changedFiles: 0 }).pullRequest;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    client = {} as GitHubClient;
    vi.mocked(getPRReviewDetails).mockResolvedValue({ pr, baseSha: 'base' });
    vi.mocked(getPRFiles).mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it('makes a preloaded review available without another network round trip', async () => {
    const preloaded = await loadCachedReviewSnapshot(client, pr);
    expect(await loadCachedReviewSnapshot(client, pr)).toBe(preloaded);
    expect(getPRReviewDetails).toHaveBeenCalledTimes(2);
    expect(getPRFiles).toHaveBeenCalledTimes(1);
  });

  it('shares a preload still in flight after 30 seconds with the review opening', async () => {
    let finish!: (files: []) => void;
    vi.mocked(getPRFiles).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const preload = loadCachedReviewSnapshot(client, pr);
    await vi.waitFor(() => expect(getPRFiles).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(31_000);
    const review = loadCachedReviewSnapshot(client, pr);
    finish([]);
    expect(await review).toBe(await preload);
    expect(getPRFiles).toHaveBeenCalledTimes(1);
  });

  it('expires snapshots without extending their submission freshness', async () => {
    const first = await loadCachedReviewSnapshot(client, pr);
    vi.advanceTimersByTime(29_000);
    expect((await loadCachedReviewSnapshot(client, pr)).loadedAt).toBe(first.loadedAt);
    vi.advanceTimersByTime(1_000);
    expect(await loadCachedReviewSnapshot(client, pr)).not.toBe(first);
    expect(getPRFiles).toHaveBeenCalledTimes(2);
  });

  it('isolates clients and invalidates known PR changes', async () => {
    await loadCachedReviewSnapshot(client, pr);
    await loadCachedReviewSnapshot({} as GitHubClient, pr);
    await loadCachedReviewSnapshot(client, { ...pr, headSha: 'new-head' });
    await loadCachedReviewSnapshot(client, { ...pr, updatedAt: '2026-11-02T12:00:00Z' });
    expect(getPRFiles).toHaveBeenCalledTimes(4);
  });

  it('reload bypasses a warm snapshot', async () => {
    const first = await loadCachedReviewSnapshot(client, pr);
    expect(await loadCachedReviewSnapshot(client, pr, true)).not.toBe(first);
    expect(getPRFiles).toHaveBeenCalledTimes(2);
  });

  it('retries failed preloads and still rejects a moving base', async () => {
    vi.mocked(getPRReviewDetails)
      .mockResolvedValueOnce({ pr, baseSha: 'base' })
      .mockResolvedValueOnce({ pr, baseSha: 'moved-base' });
    await expect(loadCachedReviewSnapshot(client, pr)).rejects.toThrow('changed while loading');
    await expect(loadCachedReviewSnapshot(client, pr)).resolves.toMatchObject({ baseSha: 'base' });
    expect(getPRFiles).toHaveBeenCalledTimes(2);
  });
});
