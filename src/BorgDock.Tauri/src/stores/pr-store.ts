import { create } from 'zustand';
import { getPRWithChecks } from '@/services/github/pulls';
import { getClient, getClientForRepo } from '@/services/github/singleton';
import { syncViewerTeams } from '@/services/github/teams';
import { createLogger } from '@/services/logger';
import {
  type AuthorLoad,
  computeAuthorLoad,
  groupPrs,
  isFailing,
  isMyPr,
  isReady,
  isReviewing,
  isWaitingOnMe,
  type PrGroup,
  type PrGroupBy,
} from '@/services/pr-grouping';
import {
  computePriorityScores,
  type PriorityScore,
  prScoreKey,
  reviewRequestKey,
  sortByPriority,
  teamReviewRequestKey,
} from '@/services/priority-scoring';
import { mergeTeamLists } from '@/services/team-membership';
import { computeTeamReviewLoad, type ReviewerLoad } from '@/services/team-review-load';
import { useSettingsStore } from '@/stores/settings-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { persistToTauriStore } from '@/utils/tauri-persist';

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
  /** Raw check runs from the refresh fetch. Absent on optimistic updates
   *  (e.g. mark-merged) — listeners keep their current runs in that case. */
  checks?: CheckRun[];
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

/** Tauri-store key under which the PR sort order is remembered across launches. */
export const PR_SORT_STORE_KEY = 'prSortBy';

interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: Date;
  /** Which GitHub pool this reading came from (REST core vs GraphQL). */
  pool?: 'rest' | 'graphql';
  /** GitHub CLI login whose quota is shown. */
  login?: string;
}

/**
 * Inputs the data-level selectors depend on. Every setter that changes one of
 * them assigns a *new* reference, so cache validity is four `===` checks — no
 * per-render fingerprint string over the whole PR list.
 */
interface DataDeps {
  prs: PullRequestWithChecks[];
  username: string;
  timestamps: Record<string, string>;
  teams: string[];
}

interface ViewDeps extends DataDeps {
  closed: PullRequestWithChecks[];
  filter: PrFilter;
  searchQuery: string;
  sortBy: SortBy;
}

interface DerivedCache {
  _dataDeps: DataDeps | null;
  _cachedPriorityScores: Map<string, PriorityScore> | null;
  _cachedTeamReviewLoad: ReviewerLoad[] | null;
  _cachedCounts: Record<PrFilter, number> | null;
  _cachedNeedsMyReview: PullRequestWithChecks[] | null;
  _cachedFocusPrs: PullRequestWithChecks[] | null;
  _cachedAuthorLoad: AuthorLoad[] | null;
  _viewDeps: ViewDeps | null;
  _cachedFilteredPrs: PullRequestWithChecks[] | null;
  _cachedGroups: { groupBy: PrGroupBy; source: PullRequestWithChecks[]; groups: PrGroup[] } | null;
}

interface PrState extends DerivedCache {
  pullRequests: PullRequestWithChecks[];
  closedPullRequests: PullRequestWithChecks[];
  filter: PrFilter;
  searchQuery: string;
  sortBy: SortBy;
  username: string;
  /** Effective team memberships (manual settings list ∪ auto-detected). */
  teams: string[];
  _manualTeams: string[];
  _detectedTeams: string[];
  isPolling: boolean;
  lastPollTime: Date | null;
  rateLimit: RateLimit | null;
  /** Maps "owner/repo#number:reviewerLogin" (or ":team:slug") → ISO timestamp of first detection */
  reviewRequestTimestamps: Record<string, string>;

  filteredPrs: () => PullRequestWithChecks[];
  /** Filtered + sorted PRs bucketed for the PR tab. */
  groupedPrs: (groupBy: PrGroupBy) => PrGroup[];
  counts: () => Record<PrFilter, number>;
  /** PRs waiting on the current user's review (directly or via a team), longest-waiting first */
  needsMyReview: () => PullRequestWithChecks[];
  /** Get the review request timestamp for a specific PR + reviewer */
  getReviewRequestedAt: (prKey: string, reviewer: string) => string | undefined;
  /** Team review load — aggregate pending reviews per reviewer */
  teamReviewLoad: () => ReviewerLoad[];
  /** Per-author roll-up for the PR tab summary strip */
  authorLoad: () => AuthorLoad[];
  /** Priority scores for Focus Mode, keyed by `owner/repo#number` */
  priorityScores: () => Map<string, PriorityScore>;
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
  /** Team list typed in Settings → GitHub. */
  setManualTeams: (teams: string[]) => void;
  /** Team list detected from `GET /user/teams`. */
  setDetectedTeams: (teams: string[]) => void;
  setPollingState: (isPolling: boolean, lastPollTime?: Date) => void;
  setRateLimit: (rateLimit: RateLimit | null) => void;
  /** Re-fetch a single PR and merge it into the store. Open PRs replace the
   *  matching entry in {@link pullRequests}; closed/merged PRs are moved to
   *  {@link closedPullRequests}. Also broadcasts a `borgdock-pr-refreshed`
   *  DOM event for any window-local listeners (e.g. pop-out detail panels). */
  refreshPr: (owner: string, repo: string, number: number) => Promise<PullRequestWithChecks | null>;
  /** Synchronously mark a PR as merged in the local store and dispatch
   *  PR_REFRESHED_EVENT, without round-tripping through GitHub. Used by
   *  pr-actions to give the PR detail window an instant visual update
   *  after a successful merge / bypass-merge call. The eventual server
   *  refresh (scheduled by pr-actions) reconciles the optimistic state. */
  optimisticallyMarkMerged: (owner: string, repo: string, number: number) => void;
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

function applyFilter(
  prs: PullRequestWithChecks[],
  closedPrs: PullRequestWithChecks[],
  filter: PrFilter,
  username: string,
  teams: string[],
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
      return prs.filter((pr) => isWaitingOnMe(pr, username, teams));
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

function sameDataDeps(a: DataDeps | null, b: DataDeps): a is DataDeps {
  return (
    a !== null &&
    a.prs === b.prs &&
    a.username === b.username &&
    a.timestamps === b.timestamps &&
    a.teams === b.teams
  );
}

function sameViewDeps(a: ViewDeps | null, b: ViewDeps): boolean {
  return (
    sameDataDeps(a, b) &&
    a.closed === b.closed &&
    a.filter === b.filter &&
    a.searchQuery === b.searchQuery &&
    a.sortBy === b.sortBy
  );
}

/** Drop every data-level memo when one of its inputs was swapped. Mutates the
 *  state object in place (selectors are called during render; no `set`). */
function ensureDataCache(state: PrState): DataDeps {
  const deps: DataDeps = {
    prs: state.pullRequests,
    username: state.username,
    timestamps: state.reviewRequestTimestamps,
    teams: state.teams,
  };
  if (sameDataDeps(state._dataDeps, deps)) return state._dataDeps;
  state._dataDeps = deps;
  state._cachedPriorityScores = null;
  state._cachedTeamReviewLoad = null;
  state._cachedCounts = null;
  state._cachedNeedsMyReview = null;
  state._cachedFocusPrs = null;
  state._cachedAuthorLoad = null;
  return deps;
}

/** Timestamps of first detection for every pending user/team review request. */
function nextReviewRequestTimestamps(
  prev: Record<string, string>,
  prs: PullRequestWithChecks[],
): Record<string, string> {
  const next = { ...prev };
  const activeKeys = new Set<string>();
  const now = new Date().toISOString();

  for (const pr of prs) {
    const p = pr.pullRequest;
    for (const reviewer of p.requestedReviewers) {
      const key = reviewRequestKey(p, reviewer);
      activeKeys.add(key);
      if (!next[key]) next[key] = now;
    }
    for (const team of p.requestedTeams ?? []) {
      const key = teamReviewRequestKey(p, team);
      activeKeys.add(key);
      if (!next[key]) next[key] = now;
    }
  }

  // Clean up timestamps for reviewers no longer requested
  for (const key of Object.keys(next)) {
    if (!activeKeys.has(key)) delete next[key];
  }
  return next;
}

export const usePrStore = create<PrState>()((set, get) => ({
  // ── Data slice ──
  pullRequests: [],
  closedPullRequests: [],
  username: '',
  teams: [],
  _manualTeams: [],
  _detectedTeams: [],
  isPolling: false,
  lastPollTime: null,
  rateLimit: null,
  reviewRequestTimestamps: {},

  // ── Derived cache ──
  _dataDeps: null,
  _cachedPriorityScores: null,
  _cachedTeamReviewLoad: null,
  _cachedCounts: null,
  _cachedNeedsMyReview: null,
  _cachedFocusPrs: null,
  _cachedAuthorLoad: null,
  _viewDeps: null,
  _cachedFilteredPrs: null,
  _cachedGroups: null,

  // ── View slice ──
  filter: 'all',
  searchQuery: '',
  sortBy: 'updated',

  // ── Computed selectors ──
  filteredPrs: () => {
    const state = get();
    const deps: ViewDeps = {
      ...ensureDataCache(state),
      closed: state.closedPullRequests,
      filter: state.filter,
      searchQuery: state.searchQuery,
      sortBy: state.sortBy,
    };
    if (state._cachedFilteredPrs && sameViewDeps(state._viewDeps, deps)) {
      return state._cachedFilteredPrs;
    }
    const filtered = applyFilter(deps.prs, deps.closed, deps.filter, deps.username, deps.teams);
    const searched = filtered.filter((pr) => matchesSearch(pr, deps.searchQuery));
    const result = sortPrs(searched, deps.sortBy, deps.username);
    state._cachedFilteredPrs = result;
    state._viewDeps = deps;
    state._cachedGroups = null;
    return result;
  },

  groupedPrs: (groupBy) => {
    const state = get();
    const prs = state.filteredPrs();
    const cached = state._cachedGroups;
    if (cached && cached.groupBy === groupBy && cached.source === prs) return cached.groups;
    const groups = groupPrs(prs, groupBy, state.username, state.teams);
    state._cachedGroups = { groupBy, source: prs, groups };
    return groups;
  },

  counts: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (state._cachedCounts) return state._cachedCounts;
    const { prs, username, teams } = deps;
    const counts = {
      all: prs.length,
      mine: prs.filter((pr) => isMyPr(pr, username)).length,
      failing: prs.filter(isFailing).length,
      ready: prs.filter(isReady).length,
      reviewing: prs.filter(isReviewing).length,
      needsReview: prs.filter((pr) => isWaitingOnMe(pr, username, teams)).length,
      closed: state.closedPullRequests.length,
    };
    state._cachedCounts = counts;
    return counts;
  },

  needsMyReview: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (!deps.username) return [];
    if (state._cachedNeedsMyReview) return state._cachedNeedsMyReview;
    const { prs, username, timestamps, teams } = deps;
    const requestedAt = (pr: PullRequestWithChecks): string => {
      const p = pr.pullRequest;
      const direct = timestamps[reviewRequestKey(p, username)];
      if (direct) return direct;
      const viaTeam = (p.requestedTeams ?? [])
        .map((t) => timestamps[teamReviewRequestKey(p, t)])
        .filter((ts): ts is string => !!ts)
        .sort()[0];
      return viaTeam ?? p.updatedAt;
    };
    const result = prs
      .filter((pr) => isWaitingOnMe(pr, username, teams))
      .sort(
        // Longest waiting first
        (a, b) => new Date(requestedAt(a)).getTime() - new Date(requestedAt(b)).getTime(),
      );
    state._cachedNeedsMyReview = result;
    return result;
  },

  getReviewRequestedAt: (prKeyStr, reviewer) => {
    const key = `${prKeyStr}:${reviewer.toLowerCase()}`;
    return get().reviewRequestTimestamps[key];
  },

  teamReviewLoad: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (state._cachedTeamReviewLoad) return state._cachedTeamReviewLoad;
    const result = computeTeamReviewLoad(deps.prs, deps.timestamps);
    state._cachedTeamReviewLoad = result;
    return result;
  },

  authorLoad: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (state._cachedAuthorLoad) return state._cachedAuthorLoad;
    const result = computeAuthorLoad(deps.prs, deps.username);
    state._cachedAuthorLoad = result;
    return result;
  },

  priorityScores: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (state._cachedPriorityScores) return state._cachedPriorityScores;
    const scores = computePriorityScores(deps.prs, deps.username, deps.timestamps, deps.teams);
    state._cachedPriorityScores = scores;
    return scores;
  },

  focusPrs: () => {
    const state = get();
    const deps = ensureDataCache(state);
    if (state._cachedFocusPrs) return state._cachedFocusPrs;
    const scores = state.priorityScores();
    const result = sortByPriority(deps.prs, scores).filter(
      (pr) => (scores.get(prScoreKey(pr.pullRequest))?.total ?? 0) > 0,
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
    set({
      pullRequests: prs,
      reviewRequestTimestamps: nextReviewRequestTimestamps(get().reviewRequestTimestamps, prs),
    });
  },
  setClosedPullRequests: (prs) => set({ closedPullRequests: prs, _cachedCounts: null }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => {
    set({ sortBy: sort });
    persistToTauriStore('ui-state.json', PR_SORT_STORE_KEY, sort).catch((err) =>
      log.debug('failed to persist sortBy', { error: String(err) }),
    );
  },
  setUsername: (username) => {
    set({ username });
    // Team memberships make "review requested from @org/team" count as
    // waiting on me. Best-effort and off the critical path: applies the
    // cached list first, refreshes from the API once per session.
    const client = username ? getClient() : null;
    if (client) syncViewerTeams(client, (teams) => get().setDetectedTeams(teams));
  },
  setManualTeams: (teams) =>
    set((state) => ({
      _manualTeams: teams,
      teams: mergeTeamLists(teams, state._detectedTeams),
    })),
  setDetectedTeams: (teams) =>
    set((state) => ({
      _detectedTeams: teams,
      teams: mergeTeamLists(state._manualTeams, teams),
    })),
  setPollingState: (isPolling, lastPollTime) =>
    set({ isPolling, ...(lastPollTime ? { lastPollTime } : {}) }),
  setRateLimit: (rateLimit) => set({ rateLimit }),
  refreshPr: async (owner, repo, number) => {
    const client = getClientForRepo(owner, repo) ?? getClient();
    if (!client) return null;

    let fresh: PullRequestWithChecks;
    let freshChecks: CheckRun[];
    try {
      const result = await getPRWithChecks(client, owner, repo, number);
      fresh = result.pr;
      freshChecks = result.checks;
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

      return {
        pullRequests,
        closedPullRequests,
        reviewRequestTimestamps: nextReviewRequestTimestamps(
          state.reviewRequestTimestamps,
          pullRequests,
        ),
      };
    });

    if (typeof document !== 'undefined') {
      const detail: PrRefreshedDetail = { owner, repo, number, pr: fresh, checks: freshChecks };
      document.dispatchEvent(new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, { detail }));
    }
    return fresh;
  },
  optimisticallyMarkMerged: (owner, repo, number) => {
    const matches = (p: PullRequestWithChecks) =>
      p.pullRequest.repoOwner === owner &&
      p.pullRequest.repoName === repo &&
      p.pullRequest.number === number;

    const state = get();
    const idx = state.pullRequests.findIndex(matches);
    if (idx < 0) return;

    const current = state.pullRequests[idx]!;
    const merged: PullRequestWithChecks = {
      ...current,
      pullRequest: {
        ...current.pullRequest,
        state: 'closed',
        mergedAt: new Date().toISOString(),
        mergeable: undefined,
      },
    };

    const pullRequests = state.pullRequests.filter((_, i) => i !== idx);
    const closedPullRequests = [merged, ...state.closedPullRequests.filter((p) => !matches(p))];

    set({
      pullRequests,
      closedPullRequests,
      reviewRequestTimestamps: nextReviewRequestTimestamps(
        state.reviewRequestTimestamps,
        pullRequests,
      ),
    });

    if (typeof document !== 'undefined') {
      const detail: PrRefreshedDetail = { owner, repo, number, pr: merged };
      document.dispatchEvent(new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, { detail }));
    }
  },
}));

// The manual team list lives in settings (Settings → GitHub → Teams). Mirror
// it into the store so every selector sees one effective list. Guarded because
// some component tests stub the settings store with a bare selector function.
if (typeof useSettingsStore.subscribe === 'function') {
  const applyManual = (teams: string[] | undefined) =>
    usePrStore.getState().setManualTeams(teams ?? []);
  applyManual(useSettingsStore.getState?.().settings.gitHub.teams);
  useSettingsStore.subscribe((s, prev) => {
    if (s.settings.gitHub.teams !== prev.settings.gitHub.teams) {
      applyManual(s.settings.gitHub.teams);
    }
  });
}
