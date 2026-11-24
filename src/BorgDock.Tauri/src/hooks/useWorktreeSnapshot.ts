import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import { WORKTREES_UPDATED_EVENT, type WorktreeSnapshot } from '@/types/worktree';

const NO_WORKTREES: WorktreeSnapshot = [];

let snapshot: WorktreeSnapshot = NO_WORKTREES;
let stopFollowing: (() => void) | null = null;
const listeners = new Set<() => void>();

function follow(): () => void {
  let stopped = false;
  const apply = (next: WorktreeSnapshot | null | undefined) => {
    if (stopped) return;
    snapshot = next ?? NO_WORKTREES;
    for (const listener of listeners) listener();
  };
  // The cache answers at once. Where Tauri is not there to ask (a test, a
  // story without the command) the list stays empty and nothing is heard.
  Promise.resolve()
    .then(() => invoke<WorktreeSnapshot>('worktree_cache_get_all'))
    .then(apply)
    .catch(() => {});
  const unlisten = Promise.resolve()
    .then(() => listen<WorktreeSnapshot>(WORKTREES_UPDATED_EVENT, (event) => apply(event.payload)))
    .catch(() => undefined);
  return () => {
    stopped = true;
    snapshot = NO_WORKTREES;
    void unlisten.then((stop) => stop?.());
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) stopFollowing = follow();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopFollowing?.();
    stopFollowing = null;
  };
}

function read(): WorktreeSnapshot {
  return snapshot;
}

/**
 * Every repository's worktrees as the Rust cache has them, local and remote:
 * the instant snapshot when the first reader mounts, then every
 * `worktrees-updated` broadcast. One subscription per window, shared by all
 * readers and dropped with the last one; it never asks for a rescan.
 */
export function useWorktreeSnapshot(): WorktreeSnapshot {
  return useSyncExternalStore(subscribe, read, read);
}
