import { isTeamRequested } from '@/services/team-membership';
import type { PullRequestWithChecks } from '@/types';

/** How the PR tab groups its rows. */
export type PrGroupBy = 'repo' | 'author' | 'status';

/** Status buckets, in the order the "Status" grouping renders them. */
export type PrStatusBucket = 'failing' | 'waitingOnMe' | 'ready' | 'inReview' | 'draft' | 'other';

export const STATUS_BUCKET_ORDER: readonly PrStatusBucket[] = [
  'failing',
  'waitingOnMe',
  'ready',
  'inReview',
  'draft',
  'other',
];

export const STATUS_BUCKET_LABEL: Record<PrStatusBucket, string> = {
  failing: 'Failing',
  waitingOnMe: 'Waiting on me',
  ready: 'Ready',
  inReview: 'In review',
  draft: 'Draft',
  other: 'Other',
};

export interface PrGroupStats {
  failing: number;
  ready: number;
  inReview: number;
  waitingOnMe: number;
  additions: number;
  deletions: number;
}

export interface PrGroup {
  /** Stable identity — used for collapse state and React keys. */
  key: string;
  kind: PrGroupBy;
  label: string;
  prs: PullRequestWithChecks[];
  /** Present for author groups. */
  author?: { login: string; avatarUrl: string; isMe: boolean };
  /** Present for status groups. */
  bucket?: PrStatusBucket;
  stats: PrGroupStats;
}

export interface AuthorLoad {
  login: string;
  avatarUrl: string;
  isMe: boolean;
  count: number;
  failing: number;
}

// ── predicates (shared with the store filters) ─────────────────────────────

export function isMyPr(pr: PullRequestWithChecks, username: string): boolean {
  return username !== '' && pr.pullRequest.authorLogin.toLowerCase() === username.toLowerCase();
}

export function isFailing(pr: PullRequestWithChecks): boolean {
  return pr.overallStatus === 'red';
}

export function isReady(pr: PullRequestWithChecks): boolean {
  return (
    pr.overallStatus === 'green' &&
    !pr.pullRequest.isDraft &&
    pr.pullRequest.mergeable !== false &&
    pr.pullRequest.reviewStatus === 'approved'
  );
}

/** Some reviewer's latest review is commented / changes requested / pending. */
export function isReviewing(pr: PullRequestWithChecks): boolean {
  const status = pr.pullRequest.reviewStatus;
  return status !== 'none' && status !== 'approved';
}

/** The user is still a pending requested reviewer — personally or via a team. */
export function isWaitingOnMe(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): boolean {
  if (!username) return false;
  if (isMyPr(pr, username)) return false;
  const me = username.toLowerCase();
  if (pr.pullRequest.requestedReviewers.some((r) => r.toLowerCase() === me)) return true;
  return isTeamRequested(pr.pullRequest.requestedTeams, teams);
}

export function classifyPrStatus(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): PrStatusBucket {
  if (isFailing(pr)) return 'failing';
  if (isWaitingOnMe(pr, username, teams)) return 'waitingOnMe';
  if (isReady(pr)) return 'ready';
  if (isReviewing(pr)) return 'inReview';
  if (pr.pullRequest.isDraft) return 'draft';
  return 'other';
}

export function summarizePrGroup(
  prs: PullRequestWithChecks[],
  username: string,
  teams: readonly string[] = [],
): PrGroupStats {
  const stats: PrGroupStats = {
    failing: 0,
    ready: 0,
    inReview: 0,
    waitingOnMe: 0,
    additions: 0,
    deletions: 0,
  };
  for (const pr of prs) {
    if (isFailing(pr)) stats.failing++;
    if (isReady(pr)) stats.ready++;
    if (isReviewing(pr)) stats.inReview++;
    if (isWaitingOnMe(pr, username, teams)) stats.waitingOnMe++;
    stats.additions += pr.pullRequest.additions ?? 0;
    stats.deletions += pr.pullRequest.deletions ?? 0;
  }
  return stats;
}

// ── grouping ───────────────────────────────────────────────────────────────

function bucketInto(
  prs: PullRequestWithChecks[],
  keyOf: (pr: PullRequestWithChecks) => string,
): Map<string, PullRequestWithChecks[]> {
  const map = new Map<string, PullRequestWithChecks[]>();
  for (const pr of prs) {
    const key = keyOf(pr);
    const list = map.get(key);
    if (list) list.push(pr);
    else map.set(key, [pr]);
  }
  return map;
}

/**
 * Group an already filtered + sorted PR list. Row order inside each group is
 * preserved; group order is:
 *  - repo:   repos containing my PRs first, then alphabetical
 *  - author: me first, then by PR count desc, then login
 *  - status: Failing → Waiting on me → Ready → In review → Draft → Other
 */
export function groupPrs(
  prs: PullRequestWithChecks[],
  groupBy: PrGroupBy,
  username: string,
  teams: readonly string[] = [],
): PrGroup[] {
  switch (groupBy) {
    case 'repo': {
      const map = bucketInto(prs, (pr) => `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}`);
      return [...map.entries()]
        .sort(([keyA, prsA], [keyB, prsB]) => {
          const aHasMine = prsA.some((pr) => isMyPr(pr, username)) ? 0 : 1;
          const bHasMine = prsB.some((pr) => isMyPr(pr, username)) ? 0 : 1;
          if (aHasMine !== bHasMine) return aHasMine - bHasMine;
          return keyA.localeCompare(keyB);
        })
        .map(([key, groupPrs]) => ({
          key: `repo:${key}`,
          kind: 'repo' as const,
          label: key,
          prs: groupPrs,
          stats: summarizePrGroup(groupPrs, username, teams),
        }));
    }
    case 'author': {
      const map = bucketInto(prs, (pr) => pr.pullRequest.authorLogin.toLowerCase());
      return [...map.entries()]
        .sort(([, prsA], [, prsB]) => {
          const aMine = isMyPr(prsA[0]!, username) ? 0 : 1;
          const bMine = isMyPr(prsB[0]!, username) ? 0 : 1;
          if (aMine !== bMine) return aMine - bMine;
          if (prsB.length !== prsA.length) return prsB.length - prsA.length;
          return prsA[0]!.pullRequest.authorLogin.localeCompare(prsB[0]!.pullRequest.authorLogin);
        })
        .map(([key, groupPrs]) => {
          const first = groupPrs[0]!.pullRequest;
          const avatarUrl = groupPrs.find((p) => p.pullRequest.authorAvatarUrl)?.pullRequest
            .authorAvatarUrl;
          return {
            key: `author:${key}`,
            kind: 'author' as const,
            label: first.authorLogin,
            prs: groupPrs,
            author: {
              login: first.authorLogin,
              avatarUrl: avatarUrl ?? '',
              isMe: isMyPr(groupPrs[0]!, username),
            },
            stats: summarizePrGroup(groupPrs, username, teams),
          };
        });
    }
    case 'status': {
      const map = bucketInto(prs, (pr) => classifyPrStatus(pr, username, teams));
      return STATUS_BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => {
        const groupPrs = map.get(bucket)!;
        return {
          key: `status:${bucket}`,
          kind: 'status' as const,
          label: STATUS_BUCKET_LABEL[bucket],
          prs: groupPrs,
          bucket,
          stats: summarizePrGroup(groupPrs, username, teams),
        };
      });
    }
  }
}

/** Per-author roll-up for the summary strip: me first, then by count desc. */
export function computeAuthorLoad(prs: PullRequestWithChecks[], username: string): AuthorLoad[] {
  const map = new Map<string, AuthorLoad>();
  for (const pr of prs) {
    const login = pr.pullRequest.authorLogin;
    if (!login) continue;
    const key = login.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        login,
        avatarUrl: pr.pullRequest.authorAvatarUrl,
        isMe: isMyPr(pr, username),
        count: 0,
        failing: 0,
      };
      map.set(key, entry);
    }
    if (!entry.avatarUrl && pr.pullRequest.authorAvatarUrl) {
      entry.avatarUrl = pr.pullRequest.authorAvatarUrl;
    }
    entry.count++;
    if (isFailing(pr)) entry.failing++;
  }
  return [...map.values()].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.login.localeCompare(b.login);
  });
}
