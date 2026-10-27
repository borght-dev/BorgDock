import { create } from 'zustand';
import { relatednessOf } from '@/services/ci-failures/hypothesis';
import { GITHUB_HOST, parseScope, scopeOf } from '@/services/ci-failures/identity';
import * as store from '@/services/ci-failures/store-api';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { createLogger } from '@/services/logger';
import { usePrStore } from '@/stores/pr-store';
import type { RepoSettings } from '@/types';

const log = createLogger('ci-failures-store');

/** What the store says changed, emitted by Rust after every write. */
export const CI_FAILURES_CHANGED_EVENT = 'ci-failures-changed';

export interface CiFailuresChange {
  revision: number;
  scopes: string[];
}

interface CiFailuresState {
  /** The store revision the groups were read at. */
  revision: number;
  loaded: boolean;
  /** Every group of the configured repos that isn't merged into another. */
  groups: CiGroupSummary[];
  setGroups: (revision: number, groups: CiGroupSummary[]) => void;
}

export const useCiFailuresStore = create<CiFailuresState>()((set) => ({
  revision: 0,
  loaded: false,
  groups: [],
  setGroups: (revision, groups) => set({ revision, groups, loaded: true }),
}));

/** The scope of a configured repository: the account it reads with is part of it. */
export function scopeOfRepo(repo: Pick<RepoSettings, 'owner' | 'name' | 'githubAccount'>): string {
  return scopeOf({
    host: GITHUB_HOST,
    account: repo.githubAccount?.trim() ?? '',
    owner: repo.owner,
    repo: repo.name,
  });
}

/** `scope#number`, the key PR-level lookups use. */
export function prKey(scope: string, prNumber: number): string {
  return `${scope}#${prNumber}`;
}

/** Facts in the shape the hypothesis rules read. */
export function factsOf(group: CiGroupSummary, defaultBranch: string | null = null) {
  return {
    prNumbers: group.prNumbers,
    defaultBranchRuns: group.defaultBranchRuns,
    defaultBranch,
    occurrenceCount: group.occurrenceCount,
    passedOnRetry: group.passedOnRetry,
    runCount: group.runCount,
    catalogIds: group.catalogIds,
    failedSteps: group.failedSteps,
  };
}

/** A group worth showing on PR rows and in Focus: confident, and across PRs or the default branch. */
export function isSharedGroup(group: CiGroupSummary): boolean {
  return (
    group.maxTier === 'high' &&
    group.status !== 'merged' &&
    relatednessOf(factsOf(group)) === 'shared'
  );
}

/** Shared groups by `scope#pr`, for row markers and the PR list filter. */
export function sharedGroupsByPr(groups: readonly CiGroupSummary[]): Map<string, CiGroupSummary[]> {
  const byPr = new Map<string, CiGroupSummary[]>();
  for (const group of groups) {
    if (!isSharedGroup(group) || group.status === 'resolved') continue;
    for (const number of group.prNumbers) {
      const key = prKey(group.scope, number);
      byPr.set(key, [...(byPr.get(key) ?? []), group]);
    }
  }
  return byPr;
}

/** Reads the groups of `scopes` again. */
export async function refreshCiFailures(scopes: string[]): Promise<void> {
  if (scopes.length === 0) {
    useCiFailuresStore.getState().setGroups(0, []);
    return;
  }
  try {
    const [snapshot, info] = await Promise.all([store.loadScope(scopes), store.storeInfo()]);
    useCiFailuresStore.getState().setGroups(info.revision, snapshot.groups);
  } catch (error) {
    log.warn('reading CI failure groups failed', { error: String(error) });
  }
}

/**
 * Keeps this window's groups current: reads them now and again (debounced)
 * whenever the store reports a change to one of `scopes()`.
 */
export function followCiFailures(scopes: () => string[]): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unlisten: (() => void) | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) void refreshCiFailures(scopes());
    }, 300);
  };
  void refreshCiFailures(scopes());
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<CiFailuresChange>(CI_FAILURES_CHANGED_EVENT, (event) => {
        const watched = new Set(scopes());
        if (event.payload.scopes.length === 0 || event.payload.scopes.some((s) => watched.has(s))) {
          refresh();
        }
      }),
    )
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    clearTimeout(timer);
    unlisten?.();
  };
}

/**
 * The branch most open PRs of `scope` target: the default branch in
 * practice, read from the PR list so no request is needed. Null without PRs.
 */
export function branchOfScope(
  scope: string | null,
  prs = usePrStore.getState().pullRequests,
): string | null {
  const parts = scope ? parseScope(scope) : null;
  const counts = new Map<string, number>();
  for (const pr of prs) {
    const p = pr.pullRequest;
    if (
      !parts ||
      p.repoOwner.toLowerCase() !== parts.owner ||
      p.repoName.toLowerCase() !== parts.repo
    )
      continue;
    counts.set(p.baseRef, (counts.get(p.baseRef) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function useCiBranch(scope: string | null): string | null {
  const prs = usePrStore((s) => s.pullRequests);
  return branchOfScope(scope, prs);
}

let sharedCache: { groups: readonly CiGroupSummary[]; byPr: Map<string, number> } | null = null;

/** PRs per shared group by lower-case `owner/repo#number`, rebuilt only when the groups change. */
function sharedCountsByPr(groups: readonly CiGroupSummary[]): Map<string, number> {
  if (sharedCache?.groups === groups) return sharedCache.byPr;
  const byPr = new Map<string, number>();
  for (const group of groups) {
    if (!isSharedGroup(group) || group.status === 'resolved') continue;
    const parts = parseScope(group.scope);
    if (!parts) continue;
    for (const number of group.prNumbers) {
      const key = `${parts.owner}/${parts.repo}#${number}`;
      byPr.set(key, Math.max(byPr.get(key) ?? 0, group.prNumbers.length));
    }
  }
  sharedCache = { groups, byPr };
  return byPr;
}

/** How many PRs share this PR's widest shared CI failure, 0 when none. */
export function useSharedFailureCount(owner: string, repo: string, number: number): number {
  return useCiFailuresStore(
    (s) => sharedCountsByPr(s.groups).get(`${owner}/${repo}#${number}`.toLowerCase()) ?? 0,
  );
}
