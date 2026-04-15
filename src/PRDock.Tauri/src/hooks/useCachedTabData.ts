import { useEffect, useState } from 'react';
import { loadTabData, saveTabData, type TabDataType } from '@/services/cache';
import { createLogger } from '@/services/logger';

const log = createLogger('cachedTab');

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface UseCachedTabDataResult<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
}

/**
 * Stale-while-revalidate hook for PR tab data.
 *
 * 1. Loads from SQLite cache immediately (no spinner if cached).
 * 2. If stale or missing, fetches from API in the background.
 * 3. Saves fresh data back to cache after fetch.
 */
export function useCachedTabData<T>(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  dataType: TabDataType,
  prUpdatedAt: string,
  fetchFn: () => Promise<T>,
): UseCachedTabDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const start = performance.now();

      // Step 1: Try loading from cache
      const cached = await loadTabData<T>(repoOwner, repoName, prNumber, dataType);

      if (cancelled) return;

      if (cached) {
        // Show cached data immediately
        setData(cached.data);
        setIsLoading(false);
        log.info('cache hit', {
          dataType,
          prNumber,
          durationMs: Math.round(performance.now() - start),
        });

        // Check staleness: PR updated after cache, or cache older than threshold
        const cachedAtMs = parseInt(cached.cachedAt, 10) * 1000;
        const isStale =
          cached.prUpdatedAt !== prUpdatedAt || Date.now() - cachedAtMs > STALE_THRESHOLD_MS;

        if (!isStale) {
          log.debug('cache fresh — skipping API fetch', { dataType, prNumber });
          return;
        }

        // Stale — refresh in background
        setIsRefreshing(true);
        log.debug('cache stale — refreshing', {
          dataType,
          prNumber,
          cachedPrUpdatedAt: cached.prUpdatedAt,
          currentPrUpdatedAt: prUpdatedAt,
        });
      } else {
        // No cache — show loading state
        log.info('cache miss', { dataType, prNumber });
      }

      // Step 2: Fetch from API
      try {
        const fetchStart = performance.now();
        const fresh = await fetchFn();
        if (cancelled) return;

        setData(fresh);
        setIsLoading(false);
        setIsRefreshing(false);
        log.info('fetch done', {
          dataType,
          prNumber,
          durationMs: Math.round(performance.now() - fetchStart),
        });

        // Step 3: Save to cache (fire-and-forget)
        saveTabData(repoOwner, repoName, prNumber, dataType, fresh, prUpdatedAt);
      } catch (err) {
        if (cancelled) return;
        log.error('fetch failed', err, { dataType, prNumber });
        // If we had cached data, keep showing it
        setIsLoading(false);
        setIsRefreshing(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [repoOwner, repoName, prNumber, dataType, prUpdatedAt, fetchFn]);

  return { data, isLoading, isRefreshing };
}
