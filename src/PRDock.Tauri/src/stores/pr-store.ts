import { create } from 'zustand';
import { computeTeamReviewLoad, type ReviewerLoad } from '@/services/team-review-load';
import type { PullRequestWithChecks } from '@/types';

export type PrFilter = 'all' | 'mine' | 'failing' | 'ready' | 'reviewing' | 'needsReview' | 'closed';
export type SortBy = 'updated' | 'created' | 'title';

interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: Date;
}

interface PrState {
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

  setPullRequests: (prs: PullRequestWithChecks[]) => void;
  setClosedPullRequests: (prs: PullRequestWithChecks[]) => void;
  setFilter: (filter: PrFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortBy) => void;
  setUsername: (username: string) => void;
  setPollingState: (isPolling: boolean, lastPollTime?: Date) => void;
  setRateLimit: (rateLimit: RateLimit | null) => void;
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
  return pr.pullRequest.requestedReviewers.some(
    (r) => r.toLowerCase() === username.toLowerCase(),
  );
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

function reviewKey(pr: { repoOwner: string; repoName: string; number: number }, reviewer: string): string {
  return `${prKey(pr)}:${reviewer.toLowerCase()}`;
}

export const usePrStore = create<PrState>()((set, get) => ({
  pullRequests: [],
  closedPullRequests: [],
  filter: 'all',
  searchQuery: '',
  sortBy: 'updated',
  username: '',
  isPolling: false,
  lastPollTime: null,
  rateLimit: null,
  reviewRequestTimestamps: {},

  filteredPrs: () => {
    const { pullRequests, closedPullRequests, filter, searchQuery, sortBy, username } = get();
    const filtered = applyFilter(pullRequests, closedPullRequests, filter, username);
    const searched = filtered.filter((pr) => matchesSearch(pr, searchQuery));
    return sortPrs(searched, sortBy, username);
  },

  groupedByRepo: () => {
    const prs = get().filteredPrs();
    return groupByRepo(prs, get().username);
  },

  counts: () => {
    const { pullRequests, closedPullRequests, username } = get();
    return {
      all: pullRequests.length,
      mine: pullRequests.filter((pr) => isMyPr(pr, username)).length,
      failing: pullRequests.filter(isFailing).length,
      ready: pullRequests.filter(isReady).length,
      reviewing: pullRequests.filter(isReviewing).length,
      needsReview: pullRequests.filter((pr) => needsReviewFrom(pr, username)).length,
      closed: closedPullRequests.length,
    };
  },

  needsMyReview: () => {
    const { pullRequests, username, reviewRequestTimestamps } = get();
    if (!username) return [];
    return pullRequests
      .filter((pr) => needsReviewFrom(pr, username))
      .sort((a, b) => {
        const aKey = reviewKey(a.pullRequest, username);
        const bKey = reviewKey(b.pullRequest, username);
        const aTime = reviewRequestTimestamps[aKey] ?? a.pullRequest.updatedAt;
        const bTime = reviewRequestTimestamps[bKey] ?? b.pullRequest.updatedAt;
        // Longest waiting first
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
  },

  getReviewRequestedAt: (prKeyStr, reviewer) => {
    const key = `${prKeyStr}:${reviewer.toLowerCase()}`;
    return get().reviewRequestTimestamps[key];
  },

  teamReviewLoad: () => {
    const { pullRequests, reviewRequestTimestamps } = get();
    return computeTeamReviewLoad(pullRequests, reviewRequestTimestamps);
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

    set({ pullRequests: prs, reviewRequestTimestamps: next });
  },
  setClosedPullRequests: (prs) => set({ closedPullRequests: prs }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setUsername: (username) => set({ username }),
  setPollingState: (isPolling, lastPollTime) =>
    set({ isPolling, ...(lastPollTime ? { lastPollTime } : {}) }),
  setRateLimit: (rateLimit) => set({ rateLimit }),
}));
