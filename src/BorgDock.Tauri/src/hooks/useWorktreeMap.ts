import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useSyncExternalStore } from 'react';
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

// ── Linked worktree count (the rail's Worktrees badge) ──────────────
//
// A tiny external store rather than a ui-store field: it is derived from the
// same cache snapshot the Worktrees section lists, including remote repos,
// and only this hook and the section write it.

let linkedWorktreeCount = 0;
const countListeners = new Set<() => void>();

/**
 * Linked worktrees in `snapshot`: every worktree but each repository's main
 * one, counted once per repository and path (a remote worktree is keyed by
 * its remote id, so the same path on two machines counts twice). This is
 * the number of non-main rows the Worktrees section shows.
 */
export function countLinkedWorktrees(snapshot: WorktreeSnapshot): number {
  const keys = new Set<string>();
  for (const repo of snapshot) {
    const scope = repo.repo.remote ? `remote:${repo.repo.remote.id}` : 'local';
    for (const wt of repo.entries) {
      if (!wt.isMainWorktree) keys.add(`${scope}:${wt.path}`);
    }
  }
  return keys.size;
}

/** Record the count for `snapshot`; listeners run only when it changed. */
export function publishWorktreeCount(snapshot: WorktreeSnapshot): void {
  const next = countLinkedWorktrees(snapshot);
  if (next === linkedWorktreeCount) return;
  linkedWorktreeCount = next;
  for (const listener of countListeners) listener();
}

function subscribeCount(listener: () => void): () => void {
  countListeners.add(listener);
  return () => countListeners.delete(listener);
}

function readCount(): number {
  return linkedWorktreeCount;
}

/**
 * How many linked worktrees (every worktree but each repository's main one)
 * the configured repositories have, local and remote, for the rail's
 * Worktrees count. Follows the worktree cache snapshot `useWorktreeMap`
 * reads, so it costs nothing and never spawns git.
 */
export function useWorktreeCount(): number {
  return useSyncExternalStore(subscribeCount, readCount, readCount);
}

/**
 * Keeps `uiStore.worktreeBranchMap` in sync with the Rust worktree cache,
 * and the rail's linked worktree count (`useWorktreeCount`) with it.
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
  // Remote repos have no branch map entry but do count on the rail.
  const hasRemoteRepos = (settings.remoteWorktreeRepos ?? []).some((r) => r.enabled && r.basePath);

  useEffect(() => {
    const basePaths = new Set(basePathKey ? basePathKey.split('\n') : []);
    if (basePaths.size === 0) commitIfChanged(new Map());
    if (basePaths.size === 0 && !hasRemoteRepos) {
      publishWorktreeCount([]);
      return;
    }

    let cancelled = false;

    const apply = (snapshot: WorktreeSnapshot) => {
      if (cancelled) return;
      publishWorktreeCount(snapshot);
      if (basePaths.size > 0) commitIfChanged(buildWorktreeBranchMap(snapshot, basePaths));
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
  }, [basePathKey, hasRemoteRepos]);
}
