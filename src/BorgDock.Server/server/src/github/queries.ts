// The GraphQL BorgDock sends and how its answers become records. One search per account per poll carries
// everything Focus needs: reviews, requests, the head commit's checks and the newest commit ids.

import type { CheckState, Person, PrComment, PrReview, ReviewThread } from '../../../shared/src/api.ts';
import type { CheckContext, PrRecord, ReviewRecord } from './focus.ts';

const CHECK_CONTEXTS = /* GraphQL */ `
  nodes {
    __typename
    ... on CheckRun {
      databaseId name status conclusion startedAt completedAt detailsUrl
      checkSuite { workflowRun { databaseId workflow { name } } }
    }
    ... on StatusContext { context state targetUrl createdAt }
  }`;

export const PR_FIELDS = /* GraphQL */ `
  id number title body url isDraft state createdAt updatedAt mergedAt
  additions deletions changedFiles headRefName baseRefName headRefOid isCrossRepository mergeable reviewDecision
  autoMergeRequest { enabledAt }
  author { login avatarUrl ... on User { name } }
  repository { name owner { login } defaultBranchRef { name } }
  labels(first: 20) { nodes { name color } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
  latestReviews(first: 25) { nodes { state submittedAt author { login } commit { oid } } }
  head: commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { ${CHECK_CONTEXTS} } } } } }
  recent: commits(last: 20) { nodes { commit { oid } } }`;

/**
 * The searches behind Focus, one per alias. GitHub's `involves` is author, assignee, mentions and commenter only:
 * a review request (yours or your team's) never matches it, and neither does a review without a comment.
 */
export const FOCUS_SEARCHES = [
  'is:open is:pr involves:@me archived:false',
  'is:open is:pr review-requested:@me archived:false',
  'is:open is:pr reviewed-by:@me archived:false',
] as const;

/**
 * Each search is its own request, a page at a time: with every check of every head commit, 40 pull requests in one
 * answer took GitHub longer than its 10 s limit (a 504), and 25 took 8 s.
 */
export const FOCUS_PAGE_SIZE = 20;
export const FOCUS_MAX_PAGES = 5;

export const FOCUS_QUERY = /* GraphQL */ `
  query FocusSearch($query: String!, $after: String) {
    viewer { login }
    found: search(query: $query, type: ISSUE, first: ${FOCUS_PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ... on PullRequest { ${PR_FIELDS} } }
    }
    rateLimit { cost remaining }
  }`;

export type FocusPage = {
  viewer: { login: string };
  found: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (RawPr | Record<string, never>)[] };
};

export const TEAMS_QUERY = /* GraphQL */ `
  query ViewerTeams($login: String!) {
    viewer { organizations(first: 20) { nodes { teams(first: 50, userLogins: [$login]) { nodes { slug } } } } }
  }`;

export const DETAIL_QUERY = /* GraphQL */ `
  query PrDetail($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed deleteBranchOnMerge viewerPermission viewerDefaultMergeMethod
      pullRequest(number: $number) {
        ${PR_FIELDS}
        commits { totalCount }
        reviews(last: 50) { nodes { state submittedAt body author { login avatarUrl ... on User { name } } } }
        reviewRequestsFull: reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login name avatarUrl } ... on Team { slug name avatarUrl } } } }
      }
    }
  }`;

export const HEAD_QUERY = /* GraphQL */ `
  query PrHead($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) { pullRequest(number: $number) { id headRefOid state headRefName isCrossRepository
      head: commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { ${CHECK_CONTEXTS} } } } } } } }
  }`;

export const CONVERSATION_QUERY = /* GraphQL */ `
  query PrConversation($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) { nodes { id path line originalLine isResolved
          comments(first: 50) { nodes { id body createdAt diffHunk author { login avatarUrl ... on User { name } } reactionGroups { content reactors { totalCount } } } } } }
        comments(last: 100) { nodes { id body createdAt author { login avatarUrl ... on User { name } } reactionGroups { content reactors { totalCount } } } }
      }
    }
  }`;

export const REPLY_MUTATION = /* GraphQL */ `
  mutation Reply($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) { comment { id } } }`;

export const RESOLVE_MUTATION = /* GraphQL */ `
  mutation Resolve($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }`;

export const AUTO_MERGE_MUTATION = /* GraphQL */ `
  mutation AutoMerge($id: ID!, $method: PullRequestMergeMethod!, $headline: String, $body: String, $head: GitObjectID) {
    enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method, commitHeadline: $headline, commitBody: $body, expectedHeadOid: $head }) { clientMutationId }
  }`;

/* ---------- answers ---------- */

type RawActor = { login: string; avatarUrl?: string; name?: string | null } | null;
type RawContext = {
  __typename: 'CheckRun' | 'StatusContext';
  databaseId?: number; name?: string; status?: string; conclusion?: string | null; startedAt?: string | null; completedAt?: string | null; detailsUrl?: string | null;
  checkSuite?: { workflowRun: { databaseId: number; workflow: { name: string } | null } | null } | null;
  context?: string; state?: string; targetUrl?: string | null; createdAt?: string;
};
export type RawPr = {
  id: string; number: number; title: string; body: string | null; url: string; isDraft: boolean; state: 'OPEN' | 'MERGED' | 'CLOSED';
  createdAt: string; updatedAt: string; mergedAt: string | null; additions: number; deletions: number; changedFiles: number;
  headRefName: string; baseRefName: string; headRefOid: string; isCrossRepository: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'; reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  autoMergeRequest: { enabledAt: string } | null;
  author: RawActor;
  repository: { name: string; owner: { login: string }; defaultBranchRef: { name: string } | null };
  labels: { nodes: { name: string; color: string }[] } | null;
  reviewRequests: { nodes: { requestedReviewer: { __typename: string; login?: string; slug?: string } | null }[] } | null;
  latestReviews: { nodes: { state: string; submittedAt: string | null; author: RawActor; commit: { oid: string } | null }[] } | null;
  head: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: RawContext[] } } | null } }[] };
  recent: { nodes: { commit: { oid: string } }[] };
};

export const person = (actor: RawActor): Person => ({ login: actor?.login ?? 'ghost', name: actor?.name ?? null, avatarUrl: actor?.avatarUrl ?? null });

const CONCLUSION: Record<string, CheckState> = {
  success: 'success', failure: 'failure', timed_out: 'failure', startup_failure: 'failure',
  cancelled: 'neutral', action_required: 'neutral', stale: 'neutral', neutral: 'neutral', skipped: 'skipped',
};
const STATUS_STATE: Record<string, CheckState> = { success: 'success', failure: 'failure', error: 'failure', pending: 'pending', expected: 'pending' };

export function mapContexts(nodes: readonly RawContext[]): CheckContext[] {
  const contexts = nodes.map((node): CheckContext => {
    if (node.__typename === 'StatusContext') {
      return {
        id: 0, kind: 'status', name: node.context ?? 'status', workflow: null, runId: null,
        state: STATUS_STATE[(node.state ?? '').toLowerCase()] ?? 'pending', conclusion: (node.state ?? '').toLowerCase() || null,
        startedAt: node.createdAt ?? null, completedAt: null, url: node.targetUrl ?? '',
      };
    }
    const conclusion = node.conclusion ? node.conclusion.toLowerCase() : null;
    const done = (node.status ?? '').toUpperCase() === 'COMPLETED';
    return {
      id: node.databaseId ?? 0, kind: 'check', name: node.name ?? 'check', workflow: node.checkSuite?.workflowRun?.workflow?.name ?? null,
      runId: node.checkSuite?.workflowRun?.databaseId ?? null,
      state: done ? (CONCLUSION[conclusion ?? ''] ?? 'neutral') : 'pending', conclusion,
      startedAt: node.startedAt ?? null, completedAt: node.completedAt ?? null, url: node.detailsUrl ?? '',
    };
  });
  // A rerun leaves the old attempt in the rollup; keep the newest per check (the desktop's latestCheckContexts).
  const latest = new Map<string, CheckContext>();
  for (const c of contexts) {
    const key = JSON.stringify([c.kind, c.name, c.workflow ?? '']);
    const prior = latest.get(key);
    if (!prior || (c.startedAt ?? '') > (prior.startedAt ?? '') || (c.startedAt === prior.startedAt && c.id > prior.id)) latest.set(key, c);
  }
  return [...latest.values()];
}

const REVIEW_STATE: Record<string, ReviewRecord['state']> = {
  APPROVED: 'approved', CHANGES_REQUESTED: 'changes_requested', COMMENTED: 'commented', DISMISSED: 'dismissed', PENDING: 'pending',
};

export function mapPr(raw: RawPr, account: string): PrRecord {
  const requests = raw.reviewRequests?.nodes ?? [];
  return {
    account,
    nodeId: raw.id,
    owner: raw.repository.owner.login,
    repo: raw.repository.name,
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    url: raw.url,
    author: person(raw.author),
    isDraft: raw.isDraft,
    state: raw.state === 'MERGED' ? 'merged' : raw.state === 'CLOSED' ? 'closed' : 'open',
    headRef: raw.headRefName,
    baseRef: raw.baseRefName,
    headSha: raw.headRefOid,
    defaultBranch: raw.repository.defaultBranchRef?.name ?? null,
    isCrossRepository: raw.isCrossRepository,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    mergedAt: raw.mergedAt,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    labels: (raw.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
    mergeable: raw.mergeable === 'MERGEABLE' ? 'mergeable' : raw.mergeable === 'CONFLICTING' ? 'conflicting' : 'unknown',
    autoMerge: raw.autoMergeRequest !== null,
    reviewDecision: raw.reviewDecision === 'APPROVED' ? 'approved' : raw.reviewDecision === 'CHANGES_REQUESTED' ? 'changes_requested' : raw.reviewDecision === 'REVIEW_REQUIRED' ? 'review_required' : null,
    requestedReviewers: requests.flatMap((r) => (r.requestedReviewer?.__typename === 'User' && r.requestedReviewer.login ? [r.requestedReviewer.login] : [])),
    requestedTeams: requests.flatMap((r) => (r.requestedReviewer?.__typename === 'Team' && r.requestedReviewer.slug ? [r.requestedReviewer.slug] : [])),
    latestReviews: (raw.latestReviews?.nodes ?? []).flatMap((r) =>
      r.author && REVIEW_STATE[r.state] ? [{ login: r.author.login, state: REVIEW_STATE[r.state], submittedAt: r.submittedAt, commitSha: r.commit?.oid ?? null }] : []),
    checks: mapContexts(raw.head.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []),
    recentCommits: raw.recent.nodes.map((n) => n.commit.oid),
  };
}

type RawReactions = { content: string; reactors: { totalCount: number } }[] | null;
type RawComment = { id: string; body: string; createdAt: string; diffHunk?: string | null; author: RawActor; reactionGroups: RawReactions };
export type RawConversation = {
  repository: { pullRequest: {
    reviewThreads: { nodes: { id: string; path: string | null; line: number | null; originalLine: number | null; isResolved: boolean; comments: { nodes: RawComment[] } }[] };
    comments: { nodes: RawComment[] };
  } | null } | null;
};

function comment(raw: RawComment): PrComment {
  return {
    id: raw.id, author: person(raw.author), body: raw.body, at: raw.createdAt,
    reactions: (raw.reactionGroups ?? []).filter((g) => g.reactors.totalCount > 0).map((g) => ({ content: g.content.toLowerCase(), count: g.reactors.totalCount })),
  };
}

export function mapConversation(raw: RawConversation): { threads: ReviewThread[]; comments: PrComment[] } {
  const pr = raw.repository?.pullRequest;
  if (!pr) return { threads: [], comments: [] };
  return {
    threads: pr.reviewThreads.nodes.map((t) => ({
      id: t.id, path: t.path, line: t.line ?? t.originalLine, diffHunk: lastHunkLines(t.comments.nodes[0]?.diffHunk ?? null), isResolved: t.isResolved,
      comments: t.comments.nodes.map(comment),
    })),
    comments: pr.comments.nodes.map(comment),
  };
}

/** The few diff lines a thread was left on: the hunk header and the last six lines of the hunk. */
function lastHunkLines(hunk: string | null): string | null {
  if (!hunk) return null;
  const lines = hunk.split('\n');
  return lines.length <= 7 ? hunk : [lines[0], ...lines.slice(-6)].join('\n');
}

type RawReview = { state: string; submittedAt: string | null; body: string; author: RawActor };

export type RawDetail = {
  repository: {
    squashMergeAllowed: boolean; mergeCommitAllowed: boolean; rebaseMergeAllowed: boolean; deleteBranchOnMerge: boolean;
    viewerPermission: string | null; viewerDefaultMergeMethod: 'MERGE' | 'SQUASH' | 'REBASE';
    pullRequest: (RawPr & {
      commits: { totalCount: number };
      reviews: { nodes: RawReview[] };
      reviewRequestsFull: { nodes: { requestedReviewer: { __typename: string; login?: string; slug?: string; name?: string | null; avatarUrl?: string } | null }[] };
    }) | null;
  } | null;
};

export function mapReviews(nodes: readonly RawReview[]): PrReview[] {
  return nodes.flatMap((r) => (REVIEW_STATE[r.state] && r.submittedAt ? [{ author: person(r.author), state: REVIEW_STATE[r.state], at: r.submittedAt, body: r.body }] : []));
}
