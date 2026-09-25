import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import type { WorktreeInfo } from '@/types/worktree';
import { shortBranch, type WorktreeListEntry, type WorktreeRepoRef } from './worktree-list-model';

function linkKey(owner: string, name: string, branch: string): string {
  return `${owner}/${name}#${shortBranch(branch)}`.toLowerCase();
}

/**
 * Open pull requests by `owner/name#branch` (lowercase), so a worktree row can
 * show the PR its branch belongs to. Reads the PR list the main window polls;
 * a window without PR data links nothing.
 *
 * Known gap: a pull request from a fork whose branch name matches a local
 * branch links too. `PullRequest` carries no head repository or fork flag
 * to tell them apart; add one to the polling query to close it.
 */
export function useLinkedPrs(): (
  repo: WorktreeRepoRef,
  branchName: string,
) => PullRequestWithChecks | undefined {
  const pullRequests = usePrStore((s) => s.pullRequests);
  const byBranch = useMemo(() => {
    const map = new Map<string, PullRequestWithChecks>();
    for (const pr of pullRequests ?? []) {
      const p = pr.pullRequest;
      if (p.state !== 'open') continue;
      map.set(linkKey(p.repoOwner, p.repoName, p.headRef), pr);
    }
    return map;
  }, [pullRequests]);
  return (repo, branchName) =>
    branchName ? byBranch.get(linkKey(repo.owner, repo.name, branchName)) : undefined;
}

/**
 * Working-tree status (clean, dirty with a count, conflicts) per worktree
 * path, for the section's meta line. `list_worktrees` runs git per worktree,
 * so it is only asked for local repositories, only while `enabled`, and again
 * only when the set of worktrees changes or `refreshToken` moves (an explicit
 * refresh) — not on every background cache broadcast.
 */
export function useWorktreeStatuses(
  entries: WorktreeListEntry[],
  enabled: boolean,
  refreshToken: number,
): ReadonlyMap<string, WorktreeInfo> {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, WorktreeInfo>>(() => new Map());

  const basePaths = [
    ...new Set(entries.filter((e) => !e.repo.remote).map((e) => e.repo.basePath)),
  ].sort();
  const pathsKey = entries
    .filter((e) => !e.repo.remote)
    .map((e) => e.wt.path)
    .sort()
    .join('\n');
  const basePathKey = basePaths.join('\n');

  useEffect(() => {
    void refreshToken;
    void pathsKey;
    if (!enabled || !basePathKey) return;
    let cancelled = false;
    const bases = basePathKey.split('\n');
    void Promise.all(
      bases.map((basePath) =>
        invoke<WorktreeInfo[]>('list_worktrees', { basePath }).catch(() => [] as WorktreeInfo[]),
      ),
    ).then((lists) => {
      if (cancelled) return;
      const next = new Map<string, WorktreeInfo>();
      for (const list of lists) {
        for (const info of list ?? []) next.set(info.path, info);
      }
      setStatuses(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, basePathKey, pathsKey, refreshToken]);

  return statuses;
}
