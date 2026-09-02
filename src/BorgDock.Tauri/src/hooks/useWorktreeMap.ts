import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';
import { WORKTREES_UPDATED_EVENT, type WorktreeSnapshot } from '@/types/worktree';

export interface WorktreeBranchMapping {
  /** Short name like "worktree1" */
  slotName: string;
  branchName: string;
  fullPath: string;
}

/** Build branch → worktree map from a cache snapshot, restricted to `basePaths`. */
export function buildWorktreeBranchMap(
  snapshot: WorktreeSnapshot,
  basePaths: ReadonlySet<string>,
): Map<string, WorktreeBranchMapping> {
  const map = new Map<string, WorktreeBranchMapping>();
  for (const repo of snapshot) {
    if (!basePaths.has(repo.repo.basePath)) continue;
    for (const wt of repo.entries) {
      if (wt.isMainWorktree || !wt.branchName) continue;
      const parts = wt.path.replace(/\\/g, '/').split('/');
      const slotName = parts[parts.length - 1] ?? wt.path;
      map.set(wt.branchName.toLowerCase(), {
        slotName,
        branchName: wt.branchName,
        fullPath: wt.path,
      });
    }
  }
  return map;
}

/** True when both maps have the same keys and identical mapping values. */
export function worktreeMapsEqual(
  a: ReadonlyMap<string, WorktreeBranchMapping>,
  b: ReadonlyMap<string, WorktreeBranchMapping>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, va] of a) {
    const vb = b.get(key);
    if (!vb) return false;
    if (
      va.slotName !== vb.slotName ||
      va.branchName !== vb.branchName ||
      va.fullPath !== vb.fullPath
    ) {
      return false;
    }
  }
  return true;
}

/** Push `map` into the UI store only when it differs from what's already there. */
function commitIfChanged(map: Map<string, WorktreeBranchMapping>) {
  const store = useUiStore.getState();
  if (worktreeMapsEqual(store.worktreeBranchMap, map)) return;
  store.setWorktreeBranchMap(map);
}

/**
 * Keeps `uiStore.worktreeBranchMap` in sync with the Rust worktree cache.
 *
 * Reads the instant `worktree_cache_get_all` snapshot on mount and then
 * follows `worktrees-updated` broadcasts (emitted after every Rust-side
 * refresh: startup, create/checkout/remove worktree, palette open, 5-min
 * timer). No git is spawned from here and no polling timer exists; the
 * store is only written when the derived map actually changed so PR cards
 * don't re-render on every refresh.
 */
export function useWorktreeMap(settings: AppSettings) {
  // Key on the enabled base paths, not the `repos` array identity — settings
  // saves produce a new array every time even when nothing relevant changed.
  const basePathKey = settings.repos
    .filter((r) => r.enabled && r.worktreeBasePath)
    .map((r) => r.worktreeBasePath)
    .sort()
    .join('\n');

  useEffect(() => {
    const basePaths = new Set(basePathKey ? basePathKey.split('\n') : []);
    if (basePaths.size === 0) {
      commitIfChanged(new Map());
      return;
    }

    let cancelled = false;

    const apply = (snapshot: WorktreeSnapshot) => {
      if (cancelled) return;
      commitIfChanged(buildWorktreeBranchMap(snapshot, basePaths));
    };

    invoke<WorktreeSnapshot>('worktree_cache_get_all')
      .then(apply)
      .catch(() => {
        // Cache unavailable (e.g. command not registered in tests) — keep
        // whatever the store has; the next broadcast will correct it.
      });

    // The repo set changed (or first mount): ask Rust to rescan so repos
    // added since the last refresh show up. Coalesced Rust-side when a
    // refresh is already in flight; the result arrives via the event.
    invoke('worktree_cache_refresh').catch(() => {});

    const unlisten = listen<WorktreeSnapshot>(WORKTREES_UPDATED_EVENT, (event) => {
      apply(event.payload);
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [basePathKey]);
}
