import { describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { GitHubClient } from '../client';
import { POLL_OPEN_PRS_QUERY, pollOpenPrsAggregate } from '../polling';

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Test PR',
    body: '',
    url: 'https://github.com/octocat/hello-world/pull/1',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    closedAt: null,
    mergedAt: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    author: { login: 'octocat', avatarUrl: 'https://x/y.png' },
    baseRefName: 'main',
    headRefName: 'feature',
    headRefOid: 'sha1',
    labels: { nodes: [{ name: 'bug' }] },
    reviewRequests: { nodes: [] },
    commits: { totalCount: 1, nodes: [{ commit: { statusCheckRollup: null } }] },
    latestReviews: { nodes: [] },
    comments: { totalCount: 3 },
    reviewThreads: { totalCount: 2 },
    ...overrides,
  };
}

function makeRollup(contexts: Array<Record<string, unknown>>, state = 'SUCCESS') {
  return {
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state,
              contexts: { pageInfo: { hasNextPage: false }, nodes: contexts },
            },
          },
        },
      ],
    },
  };
}

function makeClient(nodes: unknown[], totalCount = nodes.length): GitHubClient {
  const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
  vi.spyOn(client, 'graphql').mockResolvedValue({
    repository: { pullRequests: { totalCount, nodes } },
  });
  return client;
}

function callAdapter(nodes: unknown[]): Promise<PullRequestWithChecks[]> {
  return pollOpenPrsAggregate(makeClient(nodes), 'octocat', 'hello-world');
}

describe('POLL_OPEN_PRS_QUERY', () => {
  it('is a non-empty string', () => {
    expect(typeof POLL_OPEN_PRS_QUERY).toBe('string');
    expect(POLL_OPEN_PRS_QUERY.length).toBeGreaterThan(0);
  });

  it('declares owner and repo variables', () => {
    expect(POLL_OPEN_PRS_QUERY).toContain('$owner: String!');
    expect(POLL_OPEN_PRS_QUERY).toContain('$repo: String!');
  });

  it('requests rateLimit at the query root (outside repository)', () => {
    expect(POLL_OPEN_PRS_QUERY).toContain('rateLimit');
    const repoClose = POLL_OPEN_PRS_QUERY.lastIndexOf('rateLimit');
    const repoOpen = POLL_OPEN_PRS_QUERY.indexOf('repository(');
    expect(repoOpen).toBeGreaterThanOrEqual(0);
    expect(repoClose).toBeGreaterThan(repoOpen);
  });

  it('requests the status check rollup with pagination info', () => {
    expect(POLL_OPEN_PRS_QUERY).toContain('statusCheckRollup');
    expect(POLL_OPEN_PRS_QUERY).toContain('hasNextPage');
  });
});

describe('pollOpenPrsAggregate', () => {
  it('passes owner and repo as GraphQL variables', async () => {
    const client = makeClient([]);
    await pollOpenPrsAggregate(client, 'octocat', 'hello-world');

    expect(client.graphql).toHaveBeenCalledWith(POLL_OPEN_PRS_QUERY, {
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('returns empty array when repo has no open PRs', async () => {
    const result = await callAdapter([]);
    expect(result).toEqual([]);
  });

  it('returns empty array when repository is null (inaccessible)', async () => {
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue({ repository: null });

    const result = await pollOpenPrsAggregate(client, 'octocat', 'gone');
    expect(result).toEqual([]);
  });

  it('returns empty array when the response data is undefined (malformed 200)', async () => {
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue(undefined);

    const result = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(result).toEqual([]);
  });

  it('returns empty array when the response body is not an object (stubbed network)', async () => {
    // e2e harnesses answer api.github.com with `[]` — `[].repository` must not throw.
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue([]);

    const result = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(result).toEqual([]);
  });

  it('returns empty array when repository.pullRequests is missing', async () => {
    const client = new GitHubClient(vi.fn().mockResolvedValue('t'));
    vi.spyOn(client, 'graphql').mockResolvedValue({ repository: {} });

    const result = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(result).toEqual([]);
  });

  it('caps the result at 100 PRs and does not throw when more exist', async () => {
    const nodes = Array.from({ length: 100 }, (_, i) => makeNode({ number: i + 1 }));
    const client = makeClient(nodes, 250);

    const result = await pollOpenPrsAggregate(client, 'big', 'repo');
    expect(result.length).toBe(100);
  });
});

describe('pollOpenPrsAggregate (adapter)', () => {
  it('maps a basic PR node with no rollup → overallStatus gray', async () => {
    const [pr] = await callAdapter([makeNode()]);

    expect(pr).toBeDefined();
    expect(pr!.pullRequest.number).toBe(1);
    expect(pr!.pullRequest.title).toBe('Test PR');
    expect(pr!.pullRequest.state).toBe('open');
    expect(pr!.pullRequest.repoOwner).toBe('octocat');
    expect(pr!.pullRequest.repoName).toBe('hello-world');
    expect(pr!.pullRequest.headRef).toBe('feature');
    expect(pr!.pullRequest.headSha).toBe('sha1');
    expect(pr!.pullRequest.baseRef).toBe('main');
    expect(pr!.pullRequest.authorLogin).toBe('octocat');
    expect(pr!.pullRequest.authorAvatarUrl).toBe('https://x/y.png');
    expect(pr!.pullRequest.commentCount).toBe(5); // 3 comments + 2 review threads
    expect(pr!.pullRequest.commitCount).toBe(1);
    expect(pr!.pullRequest.labels).toEqual(['bug']);
    expect(pr!.pullRequest.mergeable).toBe(true);
    expect(pr!.overallStatus).toBe('gray');
    expect(pr!.totalCheckCount).toBe(0);
    expect(pr!.failedCheckNames).toEqual([]);
    expect(pr!.failedCheckSuiteIds).toEqual([]);
  });

  it('mergeable: CONFLICTING → false', async () => {
    const [pr] = await callAdapter([makeNode({ mergeable: 'CONFLICTING' })]);
    expect(pr!.pullRequest.mergeable).toBe(false);
  });

  it('mergeable: UNKNOWN → undefined', async () => {
    const [pr] = await callAdapter([makeNode({ mergeable: 'UNKNOWN' })]);
    expect(pr!.pullRequest.mergeable).toBeUndefined();
  });

  it('preserves isDraft', async () => {
    const [pr] = await callAdapter([makeNode({ isDraft: true })]);
    expect(pr!.pullRequest.isDraft).toBe(true);
  });

  it('handles a null author (deleted account)', async () => {
    const [pr] = await callAdapter([makeNode({ author: null })]);
    expect(pr!.pullRequest.authorLogin).toBe('');
    expect(pr!.pullRequest.authorAvatarUrl).toBe('');
  });

  it('latestReviews APPROVED + COMMENTED → reviewStatus approved', async () => {
    const [pr] = await callAdapter([
      makeNode({
        latestReviews: {
          nodes: [
            { state: 'APPROVED', author: { login: 'a' } },
            { state: 'COMMENTED', author: { login: 'b' } },
          ],
        },
      }),
    ]);
    expect(pr!.pullRequest.reviewStatus).toBe('approved');
  });

  it('latestReviews CHANGES_REQUESTED wins over APPROVED', async () => {
    const [pr] = await callAdapter([
      makeNode({
        latestReviews: {
          nodes: [
            { state: 'APPROVED', author: { login: 'a' } },
            { state: 'CHANGES_REQUESTED', author: { login: 'b' } },
          ],
        },
      }),
    ]);
    expect(pr!.pullRequest.reviewStatus).toBe('changesRequested');
  });

  it('reviewRequests with User and Team → flat string array', async () => {
    const [pr] = await callAdapter([
      makeNode({
        reviewRequests: {
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'alice' } },
            { requestedReviewer: { __typename: 'Team', name: 'platform' } },
            { requestedReviewer: { __typename: 'Mannequin' } },
            { requestedReviewer: null },
          ],
        },
      }),
    ]);
    expect(pr!.pullRequest.requestedReviewers).toEqual(['alice']);
    expect(pr!.pullRequest.requestedTeams).toEqual(['platform']);
  });

  it('all-green check runs → overallStatus green', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup([
          {
            __typename: 'CheckRun',
            name: 'build',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            checkSuite: { databaseId: 1 },
          },
        ]),
      ),
    ]);
    expect(pr!.overallStatus).toBe('green');
    expect(pr!.passedCount).toBe(1);
    expect(pr!.totalCheckCount).toBe(1);
  });

  it('mixed contexts → failed names + suite ids, pending, passed, skipped', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            {
              __typename: 'CheckRun',
              name: 'build',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              checkSuite: { databaseId: 11 },
            },
            {
              __typename: 'CheckRun',
              name: 'pending-test',
              status: 'IN_PROGRESS',
              conclusion: null,
              checkSuite: { databaseId: 22 },
            },
            {
              __typename: 'CheckRun',
              name: 'lint',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              checkSuite: { databaseId: 33 },
            },
            {
              __typename: 'CheckRun',
              name: 'optional',
              status: 'COMPLETED',
              conclusion: 'SKIPPED',
              checkSuite: { databaseId: 44 },
            },
          ],
          'FAILURE',
        ),
      ),
    ]);
    expect(pr!.overallStatus).toBe('red');
    expect(pr!.failedCheckNames).toEqual(['build']);
    expect(pr!.failedCheckSuiteIds).toEqual([11]);
    expect(pr!.pendingCheckNames).toEqual(['pending-test']);
    expect(pr!.passedCount).toBe(1);
    expect(pr!.skippedCount).toBe(1);
    expect(pr!.totalCheckCount).toBe(4);
  });

  it('timed_out conclusion counts as failed with its suite id', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            {
              __typename: 'CheckRun',
              name: 'slow',
              status: 'COMPLETED',
              conclusion: 'TIMED_OUT',
              checkSuite: { databaseId: 7 },
            },
          ],
          'FAILURE',
        ),
      ),
    ]);
    expect(pr!.failedCheckNames).toEqual(['slow']);
    expect(pr!.failedCheckSuiteIds).toEqual([7]);
    expect(pr!.overallStatus).toBe('red');
  });

  it('failed check with null checkSuite contributes name but no suite id', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            {
              __typename: 'CheckRun',
              name: 'orphan',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              checkSuite: null,
            },
          ],
          'FAILURE',
        ),
      ),
    ]);
    expect(pr!.failedCheckNames).toEqual(['orphan']);
    expect(pr!.failedCheckSuiteIds).toEqual([]);
  });

  it('cancelled check among successes stays green (cancelled is non-blocking)', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            {
              __typename: 'CheckRun',
              name: 'build',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              checkSuite: { databaseId: 1 },
            },
            {
              __typename: 'CheckRun',
              name: 'cancelled-shard',
              status: 'COMPLETED',
              conclusion: 'CANCELLED',
              checkSuite: { databaseId: 1 },
            },
          ],
          // GitHub's rollup would say FAILURE here — we deliberately derive
          // from contexts instead, preserving the REST-era behavior.
          'FAILURE',
        ),
      ),
    ]);
    expect(pr!.overallStatus).toBe('green');
    expect(pr!.failedCheckNames).toEqual([]);
  });

  it('WAITING status counts as pending', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            {
              __typename: 'CheckRun',
              name: 'gated-deploy',
              status: 'WAITING',
              conclusion: null,
              checkSuite: { databaseId: 5 },
            },
          ],
          'PENDING',
        ),
      ),
    ]);
    expect(pr!.pendingCheckNames).toEqual(['gated-deploy']);
    expect(pr!.overallStatus).toBe('yellow');
  });

  it('legacy StatusContext FAILURE contributes name but no suite id', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [{ __typename: 'StatusContext', context: 'continuous-integration', state: 'FAILURE' }],
          'FAILURE',
        ),
      ),
    ]);
    expect(pr!.failedCheckNames).toEqual(['continuous-integration']);
    expect(pr!.failedCheckSuiteIds).toEqual([]);
    expect(pr!.overallStatus).toBe('red');
  });

  it('legacy StatusContext SUCCESS and PENDING map to passed and pending', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            { __typename: 'StatusContext', context: 'ci/done', state: 'SUCCESS' },
            { __typename: 'StatusContext', context: 'ci/waiting', state: 'PENDING' },
          ],
          'PENDING',
        ),
      ),
    ]);
    expect(pr!.passedCount).toBe(1);
    expect(pr!.pendingCheckNames).toEqual(['ci/waiting']);
    expect(pr!.overallStatus).toBe('yellow');
    expect(pr!.totalCheckCount).toBe(2);
  });

  it('maps merged/closed timestamps through', async () => {
    const [pr] = await callAdapter([
      makeNode({
        state: 'MERGED',
        mergedAt: '2026-05-02T00:00:00Z',
        closedAt: '2026-05-02T00:00:00Z',
      }),
    ]);
    expect(pr!.pullRequest.state).toBe('merged');
    expect(pr!.pullRequest.mergedAt).toBe('2026-05-02T00:00:00Z');
    expect(pr!.pullRequest.closedAt).toBe('2026-05-02T00:00:00Z');
  });
});
