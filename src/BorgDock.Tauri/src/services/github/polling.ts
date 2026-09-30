import { createLogger } from '@/services/logger';
import type { CheckRun, PrReview, PullRequest, PullRequestWithChecks } from '@/types';
import { aggregatePrWithChecks } from './aggregate';
import type { GitHubClient } from './client';
import { aggregateReviewStatus, mapReviewState } from './pulls';

const log = createLogger('github:polling');

const CHECK_CONTEXT_FIELDS = /* GraphQL */ `
  pageInfo { hasNextPage endCursor }
  nodes {
    __typename
    ... on CheckRun {
      databaseId
      name
      status
      conclusion
      startedAt
      checkSuite {
        databaseId
        workflowRun {
          event
          workflow { name }
        }
      }
    }
    ... on StatusContext {
      context
      state
      createdAt
    }
  }
`;

export const POLL_CHECK_CONTEXTS_QUERY = /* GraphQL */ `
  query PollCheckContexts($id: ID!, $after: String!) {
    node(id: $id) {
      ... on StatusCheckRollup {
        contexts(first: 100, after: $after) { ${CHECK_CONTEXT_FIELDS} }
      }
    }
    rateLimit { remaining limit resetAt cost }
  }
`;

/**
 * Single-query replacement for the REST polling fan-out: open PRs, their
 * check rollups, latest reviews per user, and counts — one request per repo
 * per poll cycle, plus additional pages for large check rollups.
 *
 * Check contexts are paged in batches of 100, reviews capped at 25.
 * `body` stays in the hot
 * query because two card-level consumers need it without a detail fetch —
 * `detectWorkItemIds` (AB#123 links live in PR descriptions) and the Quick
 * Review card.
 *
 * `rateLimit` sits at the query root (it is a Query field, not a Repository
 * field) so `GitHubClient.graphql` can read the GraphQL pool from the body.
 */
export const POLL_OPEN_PRS_QUERY = /* GraphQL */ `
  query PollOpenPrs($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          number
          title
          body
          url
          state
          isDraft
          mergeable
          createdAt
          updatedAt
          closedAt
          mergedAt
          additions
          deletions
          changedFiles
          author {
            login
            avatarUrl
          }
          baseRefName
          headRefName
          headRefOid
          labels(first: 20) {
            nodes {
              name
            }
          }
          reviewRequests(first: 20) {
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  name
                  slug
                }
              }
            }
          }
          commits(last: 1) {
            totalCount
            nodes {
              commit {
                statusCheckRollup {
                  id
                  state
                  contexts(first: 100) { ${CHECK_CONTEXT_FIELDS} }
                }
              }
            }
          }
          latestReviews(first: 25) {
            nodes {
              state
              submittedAt
              author {
                login
              }
            }
          }
          comments {
            totalCount
          }
          reviewThreads {
            totalCount
          }
        }
      }
    }
    rateLimit {
      remaining
      limit
      resetAt
      cost
    }
  }
`;

type GqlMergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

interface GqlActor {
  login: string;
  avatarUrl: string;
}

/** User exposes `login`, Team exposes `name` + `slug`; other reviewer types come back bare. */
interface GqlRequestedReviewer {
  __typename: string;
  login?: string;
  name?: string;
  slug?: string;
}

interface GqlReview {
  state: string;
  submittedAt?: string | null;
  author: { login: string } | null;
}

interface GqlCheckRunContext {
  __typename: 'CheckRun';
  databaseId?: number | null;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt?: string | null;
  checkSuite: {
    databaseId: number | null;
    workflowRun?: { event: string; workflow: { name: string } | null } | null;
  } | null;
}

interface GqlStatusContext {
  __typename: 'StatusContext';
  context: string;
  state: string;
  createdAt?: string;
}

type GqlContext = GqlCheckRunContext | GqlStatusContext;

interface GqlStatusCheckRollup {
  id?: string;
  state: string;
  contexts: {
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
    nodes: GqlContext[];
  };
}

interface GqlPrNode {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: GqlMergeable;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: GqlActor | null;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  labels: { nodes: Array<{ name: string }> } | null;
  reviewRequests: { nodes: Array<{ requestedReviewer: GqlRequestedReviewer | null }> } | null;
  commits: {
    totalCount: number;
    nodes: Array<{ commit: { statusCheckRollup: GqlStatusCheckRollup | null } }>;
  };
  latestReviews: { nodes: GqlReview[] } | null;
  comments: { totalCount: number };
  reviewThreads: { totalCount: number };
}

interface PollResponse {
  repository: {
    pullRequests: {
      totalCount: number;
      nodes: GqlPrNode[];
    };
  } | null;
}

/**
 * Fetch all open PRs for a repo with their check summaries in one GraphQL
 * call, returning the same `PullRequestWithChecks` shape the REST fan-out
 * produced. The summary fields are derived by mapping rollup contexts to
 * `CheckRun`-shaped objects and reusing {@link aggregatePrWithChecks}, so
 * status semantics (including cancelled-as-non-blocking) stay identical.
 */
export async function pollOpenPrsAggregate(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]> {
  const data = await client.graphql<PollResponse>(POLL_OPEN_PRS_QUERY, { owner, repo });
  // `repository` is null when the repo is inaccessible; the optional chain also
  // tolerates malformed 200 bodies (e.g. stubbed network in tests) so a poll
  // cycle degrades to "no data" instead of TypeError-ing.
  const pullRequests = data?.repository?.pullRequests;
  if (!pullRequests) {
    log.warn('poll response missing repository.pullRequests', { owner, repo });
    return [];
  }
  if (pullRequests.totalCount > 100) {
    log.warn('PR list truncated to 100', {
      owner,
      repo,
      totalCount: pullRequests.totalCount,
    });
  }
  const results: PullRequestWithChecks[] = [];
  for (const node of pullRequests.nodes ?? []) {
    const rollup = node.commits.nodes[0]?.commit.statusCheckRollup;
    if (rollup) await loadRemainingCheckContexts(client, rollup);
    results.push(mapNode(node, owner, repo));
  }
  return results;
}

async function loadRemainingCheckContexts(
  client: GitHubClient,
  rollup: GqlStatusCheckRollup,
): Promise<void> {
  let pageInfo = rollup.contexts.pageInfo;
  const cursors = new Set<string>();
  while (pageInfo?.hasNextPage) {
    const after = pageInfo.endCursor;
    if (!rollup.id || !after || cursors.has(after)) {
      throw new Error('Incomplete GitHub check contexts pagination');
    }
    cursors.add(after);
    const data = await client.graphql<{ node: Pick<GqlStatusCheckRollup, 'contexts'> | null }>(
      POLL_CHECK_CONTEXTS_QUERY,
      { id: rollup.id, after },
    );
    if (!data.node?.contexts.pageInfo) {
      throw new Error('GitHub check contexts page is missing');
    }
    rollup.contexts.nodes.push(...data.node.contexts.nodes);
    pageInfo = data.node.contexts.pageInfo;
  }
}

function latestCheckContexts(contexts: GqlContext[]): GqlContext[] {
  const latest = new Map<string, GqlContext>();
  const timestamp = (ctx: GqlContext) =>
    Date.parse(ctx.__typename === 'CheckRun' ? (ctx.startedAt ?? '') : (ctx.createdAt ?? '')) || 0;
  for (const ctx of contexts) {
    const workflow = ctx.__typename === 'CheckRun' ? ctx.checkSuite?.workflowRun : null;
    const key = JSON.stringify(
      ctx.__typename === 'CheckRun'
        ? [ctx.__typename, ctx.name, workflow?.workflow?.name ?? '', workflow?.event ?? '']
        : [ctx.__typename, ctx.context],
    );
    const prior = latest.get(key);
    const newerRunWithoutStart =
      ctx.__typename === 'CheckRun' &&
      prior?.__typename === 'CheckRun' &&
      (!ctx.startedAt || !prior.startedAt) &&
      ctx.databaseId != null &&
      prior.databaseId != null;
    const newer = newerRunWithoutStart
      ? ctx.databaseId! > prior.databaseId!
      : timestamp(ctx) > (prior ? timestamp(prior) : 0);
    if (!prior || newer) latest.set(key, ctx);
  }
  return [...latest.values()];
}

function mapNode(node: GqlPrNode, owner: string, repo: string): PullRequestWithChecks {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
  const checkRuns = latestCheckContexts(rollup?.contexts.nodes ?? []).map(contextToCheckRunLite);

  // Users and teams are kept apart: a team request is matched against the
  // viewer's team memberships by the scorer, never against the login.
  const requestedReviewers: string[] = [];
  const requestedTeams: string[] = [];
  for (const rr of node.reviewRequests?.nodes ?? []) {
    const r = rr.requestedReviewer;
    if (!r) continue;
    if (r.__typename === 'Team') {
      const slug = r.slug ?? r.name ?? '';
      if (slug) requestedTeams.push(slug);
    } else if (r.login) {
      requestedReviewers.push(r.login);
    }
  }

  const reviewNodes = node.latestReviews?.nodes ?? [];
  const reviewStatus = aggregateReviewStatus(
    reviewNodes.map((r) => ({
      state: r.state,
      user: r.author ? { login: r.author.login, avatar_url: '' } : null,
    })),
  );
  const latestReviews: PrReview[] = [];
  for (const r of reviewNodes) {
    const state = mapReviewState(r.state);
    if (!r.author || !state) continue;
    latestReviews.push({
      authorLogin: r.author.login,
      state,
      submittedAt: r.submittedAt ?? undefined,
    });
  }

  const pr: PullRequest = {
    number: node.number,
    title: node.title,
    headRef: node.headRefName,
    headSha: node.headRefOid,
    baseRef: node.baseRefName,
    authorLogin: node.author?.login ?? '',
    authorAvatarUrl: node.author?.avatarUrl ?? '',
    state: node.state.toLowerCase(),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    isDraft: node.isDraft,
    mergeable: mapMergeable(node.mergeable),
    htmlUrl: node.url,
    body: node.body ?? '',
    repoOwner: owner,
    repoName: repo,
    reviewStatus,
    commentCount: node.comments.totalCount + node.reviewThreads.totalCount,
    labels: (node.labels?.nodes ?? []).map((l) => l.name).filter((n) => n.length > 0),
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    commitCount: node.commits.totalCount,
    mergedAt: node.mergedAt ?? undefined,
    closedAt: node.closedAt ?? undefined,
    requestedReviewers,
    requestedTeams,
    latestReviews,
  };

  return aggregatePrWithChecks(pr, checkRuns);
}

function mapMergeable(state: GqlMergeable): boolean | undefined {
  if (state === 'MERGEABLE') return true;
  if (state === 'CONFLICTING') return false;
  return undefined; // UNKNOWN — GitHub is still computing mergeability
}

/** GraphQL check statuses with no REST equivalent — all "not started yet". */
const PENDING_CHECK_STATUSES = new Set(['waiting', 'pending', 'requested']);

/**
 * Map a rollup context to the REST `CheckRun` shape so the existing
 * aggregation rules apply unchanged. These lites never reach the UI — the
 * aggregate keeps only derived counts/names/suite-ids.
 */
function contextToCheckRunLite(ctx: GqlContext): CheckRun {
  if (ctx.__typename === 'CheckRun') {
    const status = ctx.status.toLowerCase();
    return {
      id: 0,
      name: ctx.name,
      status: PENDING_CHECK_STATUSES.has(status) ? 'queued' : status,
      conclusion: ctx.conclusion?.toLowerCase(),
      htmlUrl: '',
      checkSuiteId: ctx.checkSuite?.databaseId ?? 0,
    };
  }

  const state = ctx.state.toUpperCase();
  const isPending = state === 'PENDING' || state === 'EXPECTED';
  return {
    id: 0,
    name: ctx.context,
    status: isPending ? 'queued' : 'completed',
    conclusion: isPending
      ? undefined
      : state === 'SUCCESS'
        ? 'success'
        : state === 'FAILURE' || state === 'ERROR'
          ? 'failure'
          : undefined,
    htmlUrl: '',
    checkSuiteId: 0,
  };
}
