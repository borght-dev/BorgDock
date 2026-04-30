import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import {
  __resetRepoMergeConfigCacheForTests,
  getRepoMergeConfig,
  pickMergeMethod,
} from '../repo';

function createMockClient() {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    graphql: vi.fn(),
    getRateLimit: vi.fn(),
    isRateLimitLow: false,
  } as unknown as GitHubClient;
}

beforeEach(() => {
  __resetRepoMergeConfigCacheForTests();
});

describe('pickMergeMethod', () => {
  it('prefers squash when allowed', () => {
    expect(
      pickMergeMethod({
        allowSquashMerge: true,
        allowMergeCommit: true,
        allowRebaseMerge: true,
      }),
    ).toBe('squash');
  });

  it('falls back to merge when squash is disabled', () => {
    expect(
      pickMergeMethod({
        allowSquashMerge: false,
        allowMergeCommit: true,
        allowRebaseMerge: true,
      }),
    ).toBe('merge');
  });

  it('falls back to rebase when only rebase is allowed', () => {
    expect(
      pickMergeMethod({
        allowSquashMerge: false,
        allowMergeCommit: false,
        allowRebaseMerge: true,
      }),
    ).toBe('rebase');
  });

  it('returns squash when no config is available (failed lookup)', () => {
    expect(pickMergeMethod(null)).toBe('squash');
  });

  it('returns squash when every method is disabled (degenerate repo)', () => {
    expect(
      pickMergeMethod({
        allowSquashMerge: false,
        allowMergeCommit: false,
        allowRebaseMerge: false,
      }),
    ).toBe('squash');
  });
});

describe('getRepoMergeConfig', () => {
  it('fetches the repo and translates GitHub field names', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      allow_merge_commit: false,
      allow_squash_merge: true,
      allow_rebase_merge: true,
    });

    const config = await getRepoMergeConfig(client, 'octo', 'cat');

    expect(client.get).toHaveBeenCalledWith('repos/octo/cat');
    expect(config).toEqual({
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    });
  });

  it('caches subsequent calls for the same repo', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      allow_merge_commit: true,
      allow_squash_merge: true,
      allow_rebase_merge: true,
    });

    await getRepoMergeConfig(client, 'octo', 'cat');
    await getRepoMergeConfig(client, 'OCTO', 'CAT');

    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        allow_merge_commit: false,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });

    await expect(getRepoMergeConfig(client, 'octo', 'cat')).rejects.toThrow('boom');
    const config = await getRepoMergeConfig(client, 'octo', 'cat');

    expect(config.allowSquashMerge).toBe(true);
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('treats missing fields as true (matches GitHub default of "all enabled")', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({});

    const config = await getRepoMergeConfig(client, 'octo', 'cat');

    expect(config).toEqual({
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    });
  });
});
