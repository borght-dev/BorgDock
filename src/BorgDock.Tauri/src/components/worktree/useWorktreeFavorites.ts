import { invoke } from '@tauri-apps/api/core';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  favoriteKeysFromSettings,
  settingsWithFavoriteToggled,
} from '@/services/worktree-favorites';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings, RepoSettings } from '@/types/settings';
import type { WorktreeListHost } from './WorktreeList';
import { type WorktreeListEntry, worktreeKey } from './worktree-list-model';

export interface WorktreeFavorites {
  favoriteKeys: ReadonlySet<string>;
  favoritesOnly: boolean;
  /** Repositories from the settings the list read, for the prune dialog. */
  repos: RepoSettings[] | undefined;
  toggleFavorite: (entry: WorktreeListEntry) => Promise<void>;
  toggleFavoritesOnly: () => Promise<void>;
  /** Re-read favourites from disk (tool window only; the section follows the store). */
  reload: () => Promise<void>;
}

/**
 * Favourite worktrees and the favourites-only flag, stored in settings.
 *
 * - The tool window has no hydrated settings store, so it reads
 *   `load_settings` itself and writes the whole object back with
 *   `save_settings`, optimistically, rolling back on failure.
 * - The main window's section reads the hydrated settings store and saves
 *   through it (`saveSettings`), so the store and the file never disagree and
 *   a later settings save cannot put back favourites the user removed.
 */
export function useWorktreeFavorites(host: WorktreeListHost): WorktreeFavorites {
  // ── Tool window: local copy of the file. ──
  const [windowKeys, setWindowKeys] = useState<Set<string>>(() => new Set());
  const [windowFavoritesOnly, setWindowFavoritesOnly] = useState(false);
  const [windowRepos, setWindowRepos] = useState<RepoSettings[] | undefined>(undefined);

  // ── Section: the main window's settings store. ──
  const storeSettings = useSettingsStore((s) => s.settings);
  const storeKeys = useMemo(() => favoriteKeysFromSettings(storeSettings), [storeSettings]);
  const storeFavoritesOnly = storeSettings.ui?.worktreePaletteFavoritesOnly ?? false;

  const hostRef = useRef(host);
  hostRef.current = host;

  const reload = useCallback(async () => {
    if (hostRef.current !== 'window') return;
    try {
      const settings = await invoke<AppSettings>('load_settings');
      setWindowKeys(favoriteKeysFromSettings(settings));
      setWindowFavoritesOnly(settings.ui?.worktreePaletteFavoritesOnly ?? false);
      setWindowRepos(settings.repos);
    } catch {
      // Settings load failed — stars stay empty, list still renders.
    }
  }, []);

  const favoriteKeys = host === 'window' ? windowKeys : storeKeys;
  const favoriteKeysRef = useRef(favoriteKeys);
  favoriteKeysRef.current = favoriteKeys;

  const toggleFavorite = useCallback(async (entry: WorktreeListEntry) => {
    const path = entry.wt.path;
    const key = worktreeKey(entry.repo, path);
    const wasFav = favoriteKeysRef.current.has(key);

    if (hostRef.current === 'section') {
      const store = useSettingsStore.getState();
      await store.saveSettings(
        settingsWithFavoriteToggled(store.settings, entry.repo, path, wasFav),
      );
      return;
    }

    const flip = (on: boolean) =>
      setWindowKeys((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });
    flip(!wasFav); // optimistic
    try {
      const settings = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: settingsWithFavoriteToggled(settings, entry.repo, path, wasFav),
      });
    } catch {
      flip(wasFav); // roll back
    }
  }, []);

  const favoritesOnly = host === 'window' ? windowFavoritesOnly : storeFavoritesOnly;
  const favoritesOnlyRef = useRef(favoritesOnly);
  favoritesOnlyRef.current = favoritesOnly;

  const toggleFavoritesOnly = useCallback(async () => {
    const next = !favoritesOnlyRef.current;
    if (hostRef.current === 'section') {
      const store = useSettingsStore.getState();
      await store.saveSettings({
        ...store.settings,
        ui: { ...store.settings.ui, worktreePaletteFavoritesOnly: next },
      });
      return;
    }
    setWindowFavoritesOnly(next);
    try {
      const settings = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...settings, ui: { ...settings.ui, worktreePaletteFavoritesOnly: next } },
      });
    } catch {
      setWindowFavoritesOnly(!next); // roll back
    }
  }, []);

  return {
    favoriteKeys,
    favoritesOnly,
    repos: host === 'window' ? windowRepos : undefined,
    toggleFavorite,
    toggleFavoritesOnly,
    reload,
  };
}
