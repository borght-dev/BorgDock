import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';
import type { WorktreeInfo } from '@/types/worktree';

export interface WorktreeBranchMapping {
  /** Short name like "worktree1" */
  slotName: string;
  branchName: string;
  fullPath: string;
}

/** Polls worktree branches and pushes the map into the UI store */
export function useWorktreeMap(settings: AppSettings) {
  useEffect(() => {
    const repos = settings.repos.filter((r) => r.enabled && r.worktreeBasePath);
    if (repos.length === 0) {
      useUiStore.getState().setWorktreeBranchMap(new Map());
      return;
    }

    let cancelled = false;

    async function poll() {
      const map = new Map<string, WorktreeBranchMapping>();

      await Promise.allSettled(
        repos.map(async (repo) => {
          try {
            const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', {
              basePath: repo.worktreeBasePath,
            });
            for (const wt of worktrees) {
              if (wt.isMainWorktree || !wt.branchName) continue;
              const parts = wt.path.replace(/\\/g, '/').split('/');
              const slotName = parts[parts.length - 1] ?? wt.path;
              map.set(wt.branchName.toLowerCase(), {
                slotName,
                branchName: wt.branchName,
                fullPath: wt.path,
              });
            }
          } catch {
            // Ignore individual repo errors
          }
        }),
      );

      if (!cancelled) {
        useUiStore.getState().setWorktreeBranchMap(map);
      }
    }

    poll();
    const timer = setInterval(poll, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.repos]);
}
