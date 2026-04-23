import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';

const log = createLogger('cache');

export type TabDataType = 'commits' | 'files' | 'reviews' | 'comments';

export interface CachedTabData<T> {
  data: T;
  prUpdatedAt: string;
  cachedAt: string;
}

export interface CachedEtagEntry {
  url: string;
  etag: string;
  jsonData: unknown;
}

// ---------------------------------------------------------------------------
// Tab data
// ---------------------------------------------------------------------------

export async function loadTabData<T>(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  dataType: TabDataType,
): Promise<CachedTabData<T> | null> {
  try {
    const result = await invoke<{
      data: T;
      prUpdatedAt: string;
      cachedAt: string;
    } | null>('cache_load_tab_data', {
      repoOwner,
      repoName,
      prNumber,
      dataType,
    });
    return result ?? null;
  } catch (err) {
    log.warn('loadTabData failed (returning null)', {
      repoOwner,
      repoName,
      prNumber,
      dataType,
      error: String(err),
    });
    return null;
  }
}

export async function saveTabData(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  dataType: TabDataType,
  data: unknown,
  prUpdatedAt: string,
): Promise<void> {
  try {
    await invoke('cache_save_tab_data', {
      repoOwner,
      repoName,
      prNumber,
      dataType,
      jsonData: data,
      prUpdatedAt,
    });
  } catch (err) {
    log.warn('saveTabData failed', { repoOwner, repoName, prNumber, dataType, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// ETag persistence
// ---------------------------------------------------------------------------

export async function loadCachedEtags(): Promise<CachedEtagEntry[]> {
  try {
    const entries = await invoke<CachedEtagEntry[]>('cache_load_etags');
    log.info('loaded cached etags', { count: entries.length });
    return entries;
  } catch (err) {
    log.warn('loadCachedEtags failed (returning empty)', { error: String(err) });
    return [];
  }
}

export async function saveCachedEtags(entries: CachedEtagEntry[]): Promise<void> {
  try {
    await invoke('cache_save_etags', { entries });
  } catch (err) {
    log.warn('saveCachedEtags failed', { count: entries.length, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// PR list cache (wires up existing but unused commands)
// ---------------------------------------------------------------------------

export async function loadCachedPRs(repoOwner: string, repoName: string): Promise<unknown[]> {
  try {
    return await invoke<unknown[]>('cache_load_prs', { repoOwner, repoName });
  } catch (err) {
    log.warn('loadCachedPRs failed (returning empty)', { repoOwner, repoName, error: String(err) });
    return [];
  }
}

export async function saveCachedPRs(
  repoOwner: string,
  repoName: string,
  prs: unknown[],
): Promise<void> {
  try {
    await invoke('cache_save_prs', { repoOwner, repoName, prs });
  } catch (err) {
    log.warn('saveCachedPRs failed', { repoOwner, repoName, error: String(err) });
  }
}
