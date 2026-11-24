import { invoke } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';
import {
  favoriteKeysFromSettings,
  settingsWithFavoriteToggled,
} from '@/services/worktree-favorites';
import type { AppSettings, RepoSettings } from '@/types/settings';
import { type WorktreeListEntry, worktreeKey } from './worktree-list-model';

export interface WorktreeFavorites {
  favoriteKeys: ReadonlySet<string>;
  favoritesOnly: boolean;
  /** Repositories from the settings the list read, for the prune dialog. */
  repos: RepoSettings[] | undefined;
  toggleFavorite: (entry: WorktreeListEntry) => Promise<void>;
  toggleFavoritesOnly: () => Promise<void>;
  /** Re-read favourites from disk. */
  reload: () => Promise<void>;
}

/**
 * Favourite worktrees and the favourites-only flag, stored in settings.
 *
 * The worktrees window has no hydrated settings store, so it reads
 * `load_settings` itself and writes the whole object back with
 * `save_settings`, optimistically, rolling back on failure.
 */
export function useWorktreeFavorites(): WorktreeFavorites {
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [repos, setRepos] = useState<RepoSettings[] | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      setFavoriteKeys(favoriteKeysFromSettings(settings));
      setFavoritesOnly(settings.ui?.worktreePaletteFavoritesOnly ?? false);
      setRepos(settings.repos);
    } catch {
      // Settings load failed — stars stay empty, list still renders.
    }
  }, []);

  const favoriteKeysRef = useRef(favoriteKeys);
  favoriteKeysRef.current = favoriteKeys;

  const toggleFavorite = useCallback(async (entry: WorktreeListEntry) => {
    const path = entry.wt.path;
    const key = worktreeKey(entry.repo, path);
    const wasFav = favoriteKeysRef.current.has(key);

    const flip = (on: boolean) =>
      setFavoriteKeys((prev) => {
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

  const favoritesOnlyRef = useRef(favoritesOnly);
  favoritesOnlyRef.current = favoritesOnly;

  const toggleFavoritesOnly = useCallback(async () => {
    const next = !favoritesOnlyRef.current;
    setFavoritesOnly(next);
    try {
      const settings = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...settings, ui: { ...settings.ui, worktreePaletteFavoritesOnly: next } },
      });
    } catch {
      setFavoritesOnly(!next); // roll back
    }
  }, []);

  return { favoriteKeys, favoritesOnly, repos, toggleFavorite, toggleFavoritesOnly, reload };
}
