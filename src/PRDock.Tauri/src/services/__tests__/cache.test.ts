import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  loadTabData,
  saveTabData,
  loadCachedEtags,
  saveCachedEtags,
  loadCachedPRs,
  saveCachedPRs,
} from '../cache';

describe('cache service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTabData', () => {
    it('returns cached data when available', async () => {
      const cached = {
        data: [{ sha: 'abc' }],
        prUpdatedAt: '2024-01-01T00:00:00Z',
        cachedAt: '1704067200',
      };
      mockInvoke.mockResolvedValue(cached);

      const result = await loadTabData('owner', 'repo', 42, 'commits');

      expect(result).toEqual(cached);
      expect(mockInvoke).toHaveBeenCalledWith('cache_load_tab_data', {
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        dataType: 'commits',
      });
    });

    it('returns null when no cached data', async () => {
      mockInvoke.mockResolvedValue(null);

      const result = await loadTabData('owner', 'repo', 42, 'files');

      expect(result).toBeNull();
    });

    it('returns null on error (never throws)', async () => {
      mockInvoke.mockRejectedValue(new Error('db error'));

      const result = await loadTabData('owner', 'repo', 42, 'reviews');

      expect(result).toBeNull();
    });
  });

  describe('saveTabData', () => {
    it('invokes cache_save_tab_data with correct params', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await saveTabData('owner', 'repo', 42, 'commits', [{ sha: 'abc' }], '2024-01-01');

      expect(mockInvoke).toHaveBeenCalledWith('cache_save_tab_data', {
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        dataType: 'commits',
        jsonData: [{ sha: 'abc' }],
        prUpdatedAt: '2024-01-01',
      });
    });

    it('does not throw on error', async () => {
      mockInvoke.mockRejectedValue(new Error('write failed'));

      // Should not throw
      await expect(
        saveTabData('owner', 'repo', 42, 'commits', [], '2024-01-01'),
      ).resolves.toBeUndefined();
    });
  });

  describe('loadCachedEtags', () => {
    it('returns etag entries', async () => {
      const entries = [
        { url: 'https://api.github.com/repos/o/r/pulls', etag: '"abc"', jsonData: [] },
      ];
      mockInvoke.mockResolvedValue(entries);

      const result = await loadCachedEtags();

      expect(result).toEqual(entries);
      expect(mockInvoke).toHaveBeenCalledWith('cache_load_etags');
    });

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValue(new Error('fail'));

      const result = await loadCachedEtags();

      expect(result).toEqual([]);
    });
  });

  describe('saveCachedEtags', () => {
    it('invokes cache_save_etags', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const entries = [
        { url: 'https://api.github.com/repos/o/r/pulls', etag: '"xyz"', jsonData: [1] },
      ];

      await saveCachedEtags(entries);

      expect(mockInvoke).toHaveBeenCalledWith('cache_save_etags', { entries });
    });

    it('does not throw on error', async () => {
      mockInvoke.mockRejectedValue(new Error('fail'));

      await expect(saveCachedEtags([])).resolves.toBeUndefined();
    });
  });

  describe('loadCachedPRs', () => {
    it('returns cached PR data', async () => {
      const prs = [{ pullRequest: { number: 1 } }];
      mockInvoke.mockResolvedValue(prs);

      const result = await loadCachedPRs('owner', 'repo');

      expect(result).toEqual(prs);
      expect(mockInvoke).toHaveBeenCalledWith('cache_load_prs', {
        repoOwner: 'owner',
        repoName: 'repo',
      });
    });

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValue(new Error('fail'));

      const result = await loadCachedPRs('owner', 'repo');

      expect(result).toEqual([]);
    });
  });

  describe('saveCachedPRs', () => {
    it('invokes cache_save_prs', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const prs = [{ pullRequest: { number: 1 } }];

      await saveCachedPRs('owner', 'repo', prs);

      expect(mockInvoke).toHaveBeenCalledWith('cache_save_prs', {
        repoOwner: 'owner',
        repoName: 'repo',
        prs,
      });
    });

    it('does not throw on error', async () => {
      mockInvoke.mockRejectedValue(new Error('fail'));

      await expect(saveCachedPRs('owner', 'repo', [])).resolves.toBeUndefined();
    });
  });
});
