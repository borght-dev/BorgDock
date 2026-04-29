import { create } from 'zustand';
import { getPRWithChecks } from '@/services/github/pulls';
import { getClient } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import {
  computePriorityScores,
  type PriorityScore,
  sortByPriority,
} from '@/services/priority-scoring';
import { computeTeamReviewLoad, type ReviewerLoad } from '@/services/team-review-load';
import type { PullRequestWithChecks } from '@/types';

const log = createLogger('pr-store');

/** DOM event broadcast after a single-PR refresh — pop-out windows that hold
 *  their own PR state subscribe to this to converge on server-truth without
 *  reading from the (window-local) zustand store. */
export const PR_REFRESHED_EVENT = 'borgdock-pr-refreshed';
export interface PrRefreshedDetail {
  owner: string;
  repo: string;
  number: number;
  pr: PullRequestWithChecks | null; // null = no longer accessible / removed
}

export type PrFilter =
  | 'all'
  | 'mine'
  | 'failing'
  | 'ready'
  | 'reviewing'
  | 'needsReview'
  | 'closed';
export type SortBy = 'updated' | 'created' | 'title';

interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: Date;
}

interface DerivedCache {
  /** Cache key: changes when pullRequests, username, or reviewRequestTimestamps change */
  _cacheKey: string;
  _cachedPriorityScores: Map<number, PriorityScore> | null;
  _cachedTeamReviewLoad: ReviewerLoad[] | null;
  _cachedCounts: Record<PrFilter, number> | null;
  /** Cache key for view-dependent selectors (filter, search, sort) */
  _viewCacheKey: string;
  _cachedFilteredPrs: PullRequestWithChecks[] | null;
  _cachedGroupedByRepo: Map<string, PullRequestWithChecks[]> | null;
  _cachedNeedsMyReview: PullRequestWithChecks[] | null;
  _cachedFocusPrs: PullRequestWithChecks[] | null;
}

interface PrState extends DerivedCache {
  pullRequests: PullRequestWithChecks[];
  closedPullRequests: PullRequestWithChecks[];
  filter: PrFilter;
  searchQuery: string;
  sortBy: SortBy;
  username: string;
  isPolling: boolean;
  lastPollTime: Date | null;
  rateLimit: RateLimit | null;
  /** Maps "owner/repo#number:reviewerLogin" → ISO timestamp of first detection */
  reviewRequestTimestamps: Record<string, string>;

  filteredPrs: () => PullRequestWithChecks[];
  groupedByRepo: () => Map<string, PullRequestWithChecks[]>;
  counts: () => Record<PrFilter, number>;
  /** PRs where the current user is a requested reviewer, sorted longest-waiting first */
  needsMyReview: () => PullRequestWithChecks[];
  /** Get the review request timestamp for a specific PR + reviewer */
  getReviewRequestedAt: (prKey: string, reviewer: string) => string | undefined;
  /** Team review load — aggregate pending reviews per reviewer */
  teamReviewLoad: () => ReviewerLoad[];
  /** Priority scores for Focus Mode */
  priorityScores: () => Map<number, PriorityScore>;
  /** PRs sorted by priority for Focus Mode */
  focusPrs: () => PullRequestWithChecks[];
  /** Count of non-zero-score PRs for Focus badge */
  focusCount: () => number;

  setPullRequests: (prs: PullRequestWithChecks[]) => void;
  setClosedPullRequests: (prs: PullRequestWithChecks[]) => void;
  setFilter: (filter: PrFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortBy) => void;
  setUsername: (username: string) => void;
  setPollingState: (isPolling: boolean, lastPollTime?: Date) => void;
  setRateLimit: (rateLimit: RateLimit | null) => void;
  /** Re-fetch a single PR and merge it into the store. Open PRs replace the
   *  matching entry in {@link pullRequests}; closed/merged PRs are moved to
   *  {@link closedPullRequests}. Also broadcasts a `borgdock-pr-refreshed`
   *  DOM event for any window-local listeners (e.g. pop-out detail panels). */
  refreshPr: (
    owner: string,
    repo: string,
    number: number,
  ) => Promise<PullRequestWithChecks | null>;
}

function matchesSearch(pr: PullRequestWithChecks, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const p = pr.pullRequest;
  return (
    p.title.toLowerCase().includes(q) ||
    p.authorLogin.toLowerCase().includes(q) ||
    p.headRef.toLowerCase().includes(q) ||
    `${p.repoOwner}/${p.repoName}`.toLowerCase().includes(q) ||
    p.number.toString().includes(q) ||
    p.labels.some((l) => l.toLowerCase().includes(q))
  );
}

function isMyPr(pr: PullRequestWithChecks, username: string): boolean {
  return username !== '' && pr.pullRequest.authorLogin.toLowerCase() === username.toLowerCase();
}

function isFailing(pr: PullRequestWithChecks): boolean {
  return pr.overallStatus === 'red';
}

function isReady(pr: PullRequestWithChecks): boolean {
  return (
    pr.overallStatus === 'green' &&
    !pr.pullRequest.isDraft &&
    pr.pullRequest.mergeable !== false &&
    pr.pullRequest.reviewStatus === 'approved'
  );
}

function isReviewing(pr: PullRequestWithChecks): boolean {
  const status = pr.pullRequest.reviewStatus;
  return status !== 'none' && status !== 'approved';
}

function needsReviewFrom(pr: PullRequestWithChecks, username: string): boolean {
  if (!username) return false;
  return pr.pullRequest.requestedReviewers.some((r) => r.toLowerCase() === username.toLowerCase());
}

function applyFilter(
  prs: PullRequestWithChecks[],
  closedPrs: PullRequestWithChecks[],
  filter: PrFilter,
  username: string,
): PullRequestWithChecks[] {
  switch (filter) {
    case 'all':
      return prs;
    case 'mine':
      return prs.filter((pr) => isMyPr(pr, username));
    case 'failing':
      return prs.filter(isFailing);
    case 'ready':
      return prs.filter(isReady);
    case 'reviewing':
      return prs.filter(isReviewing);
    case 'needsReview':
      return prs.filter((pr) => needsReviewFrom(pr, username));
    case 'closed':
      return closedPrs;
  }
}

function sortPrs(
  prs: PullRequestWithChecks[],
  sortBy: SortBy,
  username: string,
): PullRequestWithChecks[] {
  return [...prs].sort((a, b) => {
    // My PRs first
    const aIsMine = isMyPr(a, username) ? 0 : 1;
    const bIsMine = isMyPr(b, username) ? 0 : 1;
    if (aIsMine !== bIsMine) return aIsMine - bIsMine;

    // Drafts last
    const aDraft = a.pullRequest.isDraft ? 1 : 0;
    const bDraft = b.pullRequest.isDraft ? 1 : 0;
    if (aDraft !== bDraft) return aDraft - bDraft;

    switch (sortBy) {
      case 'updated':
        return (
          new Date(b.pullRequest.updatedAt).getTime() - new Date(a.pullRequest.updatedAt).getTime()
        );
      case 'created':
        return (
          new Date(b.pullRequest.createdAt).getTime() - new Date(a.pullRequest.createdAt).getTime()
        );
      case 'title':
        return a.pullRequest.title.localeCompare(b.pullRequest.title);
      default:
        return 0;
    }
  });
}

function groupByRepo(
  prs: PullRequestWithChecks[],
  username: string,
): Map<string, PullRequestWithChecks[]> {
  const groups = new Map<string, PullRequestWithChecks[]>();

  for (const pr of prs) {
    const key = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(pr);
    } else {
      groups.set(key, [pr]);
    }
  }

  // Sort groups: repos with user's PRs first, then alphabetically
  const sortedEntries = [...groups.entries()].sort(([keyA, prsA], [keyB, prsB]) => {
    const aHasMine = prsA.some((pr) => isMyPr(pr, username)) ? 0 : 1;
    const bHasMine = prsB.some((pr) => isMyPr(pr, username)) ? 0 : 1;
    if (aHasMine !== bHasMine) return aHasMine - bHasMine;
    return keyA.localeCompare(keyB);
  });

  return new Map(sortedEntries);
}

function prKey(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

function reviewKey(
  pr: { repoOwner: string; repoName: string; number: number },
  reviewer: string,
): string {
  return `${prKey(pr)}:${reviewer.toLowerCase()}`;
}

function makeCacheKey(
  prs: PullRequestWithChecks[],
  username: string,
  timestamps: Record<string, string>,
): string {
  const prFingerprint = prs
    .map((p) => `${p.pullRequest.number}:${p.overallStatus}:${p.pullRequest.reviewStatus}`)
    .join(',');
  const tsKeys = Object.keys(timestamps).sort().join(',');
  return `${prFingerprint}|${username}|${tsKeys}`;
}

function makeViewCacheKey(
  dataCacheKey: string,
  filter: PrFilter,
  searchQuery: string,
  sortBy: SortBy,
  closedCount: number,
): string {
  return `${dataCacheKey}|${filter}|${searchQuery}|${sortBy}|${closedCount}`;
}

export const usePrStore = create<PrState>()((set, get) => ({
  // ── Data slice ──
  pullRequests: [],
  closedPullRequests: [],
  username: '',
  isPolling: false,
  lastPollTime: null,
  rateLimit: null,
  reviewRequestTimestamps: {},

  // ── Derived cache ──
  _cacheKey: '',
  _cachedPriorityScores: null,
  _cachedTeamReviewLoad: null,
  _cachedCounts: null,
  _viewCacheKey: '',
  _cachedFilteredPrs: null,
  _cachedGroupedByRepo: null,
  _cachedNeedsMyReview: null,
  _cachedFocusPrs: null,

  // ── View slice ──
  filter: 'all',
  searchQuery: '',
  sortBy: 'updated',

  // ── Computed selectors ──
  filteredPrs: () => {
    const state = get();
    const { pullRequests, closedPullRequests, filter, searchQuery, sortBy, username } = state;
    const viewKey = makeViewCacheKey(
      state._cacheKey,
      filter,
      searchQuery,
      sortBy,
      closedPullRequests.length,
    );
    if (state._cachedFilteredPrs && state._viewCacheKey === viewKey)
      return state._cachedFilteredPrs;
    const filtered = applyFilter(pullRequests, closedPullRequests, filter, username);
    const searched = filtered.filter((pr) => matchesSearch(pr, searchQuery));
    const result = sortPrs(searched, sortBy, username);
    state._cachedFilteredPrs = result;
    state._viewCacheKey = viewKey;
    state._cachedGroupedByRepo = null;
    return result;
  },

  groupedByRepo: () => {
    const state = get();
    if (state._cachedGroupedByRepo && state._cachedFilteredPrs) return state._cachedGroupedByRepo;
    const prs = get().filteredPrs();
    const result = groupByRepo(prs, state.username);
    state._cachedGroupedByRepo = result;
    return result;
  },

  counts: () => {
    const state = get();
    const { pullRequests, closedPullRequests, username } = state;
    const key = makeCacheKey(pullRequests, username, state.reviewRequestTimestamps);
    if (state._cachedCounts && state._cacheKey === key) return state._cachedCounts;
    const counts = {
      all: pullRequests.length,
      mine: pullRequests.filter((pr) => isMyPr(pr, username)).length,
      failing: pullRequests.filter(isFailing).length,
      ready: pullRequests.filter(isReady).length,
      reviewing: pullRequests.filter(isReviewing).length,
      needsReview: pullRequests.filter((pr) => needsReviewFrom(pr, username)).length,
      closed: closedPullRequests.length,
    };
    state._cachedCounts = counts;
    return counts;
  },

  needsMyReview: () => {
    const state = get();
    const { pullRequests, username, reviewRequestTimestamps } = state;
    if (!username) return [];
    const key = makeCacheKey(pullRequests, username, reviewRequestTimestamps);
    if (state._cachedNeedsMyReview && state._cacheKey === key) return state._cachedNeedsMyReview;
    const result = pullRequests
      .filter((pr) => needsReviewFrom(pr, username))
      .sort((a, b) => {
        const aKey = reviewKey(a.pullRequest, username);
        const bKey = reviewKey(b.pullRequest, username);
        const aTime = reviewRequestTimestamps[aKey] ?? a.pullRequest.updatedAt;
        const bTime = reviewRequestTimestamps[bKey] ?? b.pullRequest.updatedAt;
        // Longest waiting first
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
    state._cachedNeedsMyReview = result;
    return result;
  },

  getReviewRequestedAt: (prKeyStr, reviewer) => {
    const key = `${prKeyStr}:${reviewer.toLowerCase()}`;
    return get().reviewRequestTimestamps[key];
  },

  teamReviewLoad: () => {
    const state = get();
    const { pullRequests, reviewRequestTimestamps, username } = state;
    const key = makeCacheKey(pullRequests, username, reviewRequestTimestamps);
    if (state._cachedTeamReviewLoad && state._cacheKey === key) return state._cachedTeamReviewLoad;
    const result = computeTeamReviewLoad(pullRequests, reviewRequestTimestamps);
    state._cachedTeamReviewLoad = result;
    return result;
  },

  priorityScores: () => {
    const state = get();
    const { pullRequests, username, reviewRequestTimestamps } = state;
    const key = makeCacheKey(pullRequests, username, reviewRequestTimestamps);
    if (state._cachedPriorityScores && state._cacheKey === key) return state._cachedPriorityScores;
    const scores = computePriorityScores(pullRequests, username, reviewRequestTimestamps);
    state._cachedPriorityScores = scores;
    return scores;
  },

  focusPrs: () => {
    const state = get();
    const { pullRequests } = state;
    const key = makeCacheKey(pullRequests, state.username, state.reviewRequestTimestamps);
    if (state._cachedFocusPrs && state._cacheKey === key) return state._cachedFocusPrs;
    const scores = get().priorityScores();
    const result = sortByPriority(pullRequests, scores).filter(
      (pr) => (scores.get(pr.pullRequest.number)?.total ?? 0) > 0,
    );
    state._cachedFocusPrs = result;
    return result;
  },

  focusCount: () => {
    const scores = get().priorityScores();
    let count = 0;
    for (const score of scores.values()) {
      if (score.total > 0) count++;
    }
    return count;
  },

  setPullRequests: (prs) => {
    const prev = get().reviewRequestTimestamps;
    const next = { ...prev };
    const activeKeys = new Set<string>();

    for (const pr of prs) {
      for (const reviewer of pr.pullRequest.requestedReviewers) {
        const key = reviewKey(pr.pullRequest, reviewer);
        activeKeys.add(key);
        if (!next[key]) {
          next[key] = new Date().toISOString();
        }
      }
    }

    // Clean up timestamps for reviewers no longer requested
    for (const key of Object.keys(next)) {
      if (!activeKeys.has(key)) {
        delete next[key];
      }
    }

    const newKey = makeCacheKey(prs, get().username, next);
    set({
      pullRequests: prs,
      reviewRequestTimestamps: next,
      _cacheKey: newKey,
      _cachedPriorityScores: null,
      _cachedTeamReviewLoad: null,
      _cachedCounts: null,
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _cachedNeedsMyReview: null,
      _cachedFocusPrs: null,
      _viewCacheKey: '',
    });
  },
  setClosedPullRequests: (prs) =>
    set({
      closedPullRequests: prs,
      _cachedCounts: null,
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _viewCacheKey: '',
    }),
  setFilter: (filter) =>
    set({ filter, _cachedFilteredPrs: null, _cachedGroupedByRepo: null, _viewCacheKey: '' }),
  setSearchQuery: (query) =>
    set({
      searchQuery: query,
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _viewCacheKey: '',
    }),
  setSortBy: (sort) =>
    set({ sortBy: sort, _cachedFilteredPrs: null, _cachedGroupedByRepo: null, _viewCacheKey: '' }),
  setUsername: (username) => {
    const state = get();
    const newKey = makeCacheKey(state.pullRequests, username, state.reviewRequestTimestamps);
    set({
      username,
      _cacheKey: newKey,
      _cachedPriorityScores: null,
      _cachedTeamReviewLoad: null,
      _cachedCounts: null,
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _cachedNeedsMyReview: null,
      _cachedFocusPrs: null,
      _viewCacheKey: '',
    });
  },
  setPollingState: (isPolling, lastPollTime) =>
    set({ isPolling, ...(lastPollTime ? { lastPollTime } : {}) }),
  setRateLimit: (rateLimit) => set({ rateLimit }),
  refreshPr: async (owner, repo, number) => {
    const client = getClient();
    if (!client) return null;

    let fresh: PullRequestWithChecks;
    try {
      fresh = await getPRWithChecks(client, owner, repo, number);
    } catch (err) {
      log.warn('refreshPr fetch failed', { error: String(err), owner, repo, number });
      return null;
    }

    const matches = (p: PullRequestWithChecks) =>
      p.pullRequest.repoOwner === owner &&
      p.pullRequest.repoName === repo &&
      p.pullRequest.number === number;

    set((state) => {
      const isOpen = fresh.pullRequest.state === 'open';

      let pullRequests = state.pullRequests;
      let closedPullRequests = state.closedPullRequests;

      if (isOpen) {
        const idx = pullRequests.findIndex(matches);
        if (idx >= 0) {
          pullRequests = [...pullRequests];
          pullRequests[idx] = fresh;
        } else {
          pullRequests = [...pullRequests, fresh];
        }
        if (closedPullRequests.some(matches)) {
          closedPullRequests = closedPullRequests.filter((p) => !matches(p));
        }
      } else {
        if (pullRequests.some(matches)) {
          pullRequests = pullRequests.filter((p) => !matches(p));
        }
        // Prepend so a freshly-merged PR shows up at the top of the closed view.
        closedPullRequests = [fresh, ...closedPullRequests.filter((p) => !matches(p))];
      }

      const newCacheKey = makeCacheKey(pullRequests, state.username, state.reviewRequestTimestamps);
      return {
        pullRequests,
        closedPullRequests,
        _cacheKey: newCacheKey,
        _cachedPriorityScores: null,
        _cachedTeamReviewLoad: null,
        _cachedCounts: null,
        _cachedFilteredPrs: null,
        _cachedGroupedByRepo: null,
        _cachedNeedsMyReview: null,
        _cachedFocusPrs: null,
        _viewCacheKey: '',
      };
    });

    if (typeof document !== 'undefined') {
      const detail: PrRefreshedDetail = { owner, repo, number, pr: fresh };
      document.dispatchEvent(new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, { detail }));
    }
    return fresh;
  },
}));
