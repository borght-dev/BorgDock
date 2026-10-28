import { describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { GitHubClient } from '../client';
import {
  POLL_CHECK_CONTEXTS_QUERY,
  POLL_OPEN_PRS_QUERY,
  POLL_PR_SUMMARIES_QUERY,
  pollOpenPrsAggregate,
} from '../polling';

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: `PR_${overrides.number ?? 1}`,
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
    labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
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
  vi.spyOn(client, 'graphql').mockImplementation(async (query, variables) => {
    if (query === POLL_OPEN_PRS_QUERY) {
      return {
        repository: { pullRequests: { totalCount, pageInfo: { hasNextPage: false }, nodes } },
      };
    }
    const ids = variables?.ids as string[];
    return { nodes: nodes.filter((node) => ids.includes((node as { id: string }).id)) };
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
    expect(POLL_PR_SUMMARIES_QUERY).toContain('statusCheckRollup');
    expect(POLL_OPEN_PRS_QUERY).toContain('hasNextPage');
  });
});

describe('pollOpenPrsAggregate', () => {
  it('shares the four-request limit between summaries and check pages', async () => {
    const nodes = Array.from({ length: 21 }, (_, i) => {
      const commits = makeRollup([]);
      const rollup = commits.commits.nodes[0]!.commit.statusCheckRollup;
      Object.assign(rollup, { id: `rollup${i}` });
      Object.assign(rollup.contexts.pageInfo, { hasNextPage: i < 20, endCursor: 'next' });
      return makeNode({ number: i + 1, ...commits });
    });
    const client = makeClient(nodes);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximum = 0;
    let checkPages = 0;
    vi.mocked(client.graphql).mockImplementation(async (query, variables) => {
      if (query === POLL_OPEN_PRS_QUERY)
        return {
          repository: {
            pullRequests: {
              pageInfo: { hasNextPage: false },
              nodes,
            },
          },
        };
      const ids = variables?.ids as string[] | undefined;
      if (query === POLL_PR_SUMMARIES_QUERY && !ids?.includes('PR_21')) {
        return { nodes: nodes.filter((node) => ids?.includes(node.id)) };
      }
      active++;
      maximum = Math.max(maximum, active);
      if (query === POLL_CHECK_CONTEXTS_QUERY) checkPages++;
      await gate;
      active--;
      return query === POLL_PR_SUMMARIES_QUERY
        ? { nodes: nodes.filter((node) => ids?.includes(node.id)) }
        : { node: { contexts: { pageInfo: { hasNextPage: false }, nodes: [] } } };
    });
    const poll = pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    try {
      await vi.waitFor(() => expect(active).toBe(4), { timeout: 500, interval: 10 });
      expect(checkPages).toBe(3);
    } finally {
      release();
      expect(await poll).toHaveLength(21);
    }
    expect(maximum).toBe(4);
    expect(checkPages).toBe(20);
  });

  it('starts check pagination before slower summary batches finish', async () => {
    const commits = makeRollup([]);
    const rollup = commits.commits.nodes[0]!.commit.statusCheckRollup;
    Object.assign(rollup, { id: 'rollup1' });
    Object.assign(rollup.contexts.pageInfo, { hasNextPage: true, endCursor: 'next' });
    const nodes = Array.from({ length: 11 }, (_, i) =>
      makeNode({ number: i + 1, ...(i === 0 ? commits : {}) }),
    );
    const client = makeClient(nodes);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let checkStarted = false;
    vi.mocked(client.graphql).mockImplementation(async (query, variables) => {
      if (query === POLL_OPEN_PRS_QUERY)
        return {
          repository: {
            pullRequests: {
              pageInfo: { hasNextPage: false },
              nodes,
            },
          },
        };
      if (query === POLL_PR_SUMMARIES_QUERY) {
        const ids = variables?.ids as string[];
        if (ids.includes('PR_11')) await gate;
        return { nodes: nodes.filter((node) => ids.includes(node.id)) };
      }
      checkStarted = true;
      return { node: { contexts: { pageInfo: { hasNextPage: false }, nodes: [] } } };
    });
    const poll = pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    try {
      await vi.waitFor(() => expect(checkStarted).toBe(true), { timeout: 500, interval: 10 });
    } finally {
      release();
      await poll;
    }
  });

  it('keeps repository queries small and follows every PR page', async () => {
    const client = makeClient([]);
    vi.mocked(client.graphql).mockImplementation(async (query, variables) => {
      if (query === POLL_PR_SUMMARIES_QUERY) {
        const ids = variables?.ids as string[];
        expect(ids.length).toBeLessThanOrEqual(10);
        return { nodes: ids.map((id) => makeNode({ number: Number(id) })) };
      }
      const offset = Number(variables?.after ?? 0);
      return {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: offset === 0, endCursor: '100' },
            nodes: Array.from({ length: offset === 0 ? 100 : 10 }, (_, i) => ({
              id: String(offset + i + 1),
            })),
          },
        },
      };
    });

    const prs = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(prs.map((pr) => pr.pullRequest.number)).toEqual(
      Array.from({ length: 110 }, (_, i) => i + 1),
    );
    expect(client.graphql).toHaveBeenCalledWith(POLL_OPEN_PRS_QUERY, {
      owner: 'octocat',
      repo: 'hello-world',
      after: '100',
    });
  });

  it('loads independent check pages concurrently with at most four in flight', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) => {
      const commits = makeRollup([]);
      const rollup = commits.commits.nodes[0]!.commit.statusCheckRollup;
      Object.assign(rollup, { id: `rollup${i}` });
      Object.assign(rollup.contexts.pageInfo, { hasNextPage: true, endCursor: 'next' });
      return makeNode({ number: i + 1, ...commits });
    });
    const client = makeClient(nodes);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximum = 0;
    vi.mocked(client.graphql).mockImplementation(async (query) => {
      if (query === POLL_OPEN_PRS_QUERY) {
        return {
          repository: { pullRequests: { totalCount: 5, pageInfo: { hasNextPage: false }, nodes } },
        };
      }
      if (query === POLL_PR_SUMMARIES_QUERY) return { nodes };
      active++;
      maximum = Math.max(maximum, active);
      await gate;
      active--;
      return { node: { contexts: { pageInfo: { hasNextPage: false }, nodes: [] } } };
    });
    const poll = pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    try {
      await vi.waitFor(() => expect(active).toBe(4), { timeout: 500, interval: 10 });
    } finally {
      release();
      await poll;
    }
    expect(maximum).toBe(4);
    expect(client.graphql).toHaveBeenCalledTimes(7);
  });

  it('loads summary batches concurrently with at most four in flight', async () => {
    const nodes = Array.from({ length: 41 }, (_, i) => makeNode({ number: i + 1 }));
    const client = makeClient(nodes);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximum = 0;
    vi.mocked(client.graphql).mockImplementation(async (query, variables) => {
      if (query === POLL_PR_SUMMARIES_QUERY) {
        active++;
        maximum = Math.max(maximum, active);
        await gate;
        active--;
        const ids = variables?.ids as string[];
        return { nodes: nodes.filter((node) => ids.includes(node.id)) };
      }
      return { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes } } };
    });
    const poll = pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    try {
      await vi.waitFor(() => expect(active).toBe(4), { timeout: 500, interval: 10 });
    } finally {
      release();
      expect(await poll).toHaveLength(41);
    }
    expect(maximum).toBe(4);
  });

  it.each([
    { nodes: [] },
    { nodes: [null] },
  ])('rejects incomplete summary batches', async (summaries) => {
    const client = makeClient([makeNode()]);
    vi.mocked(client.graphql)
      .mockResolvedValueOnce({
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false },
            nodes: [{ id: 'PR_1' }],
          },
        },
      })
      .mockResolvedValueOnce(summaries);
    await expect(pollOpenPrsAggregate(client, 'octocat', 'hello-world')).rejects.toThrow(
      'incomplete',
    );
  });

  it('passes owner and repo as GraphQL variables', async () => {
    const client = makeClient([]);
    await pollOpenPrsAggregate(client, 'octocat', 'hello-world');

    expect(client.graphql).toHaveBeenCalledWith(POLL_OPEN_PRS_QUERY, {
      owner: 'octocat',
      repo: 'hello-world',
      after: null,
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

  it.each([null, 'repeated'])('rejects incomplete PR pagination with cursor %s', async (cursor) => {
    const client = makeClient([]);
    vi.mocked(client.graphql).mockResolvedValue({
      repository: {
        pullRequests: {
          totalCount: 20,
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: cursor },
        },
      },
    });
    await expect(pollOpenPrsAggregate(client, 'big', 'repo')).rejects.toThrow('pagination');
  });
});

describe('pollOpenPrsAggregate (adapter)', () => {
  const attempt = (overrides: Record<string, unknown> = {}) => ({
    __typename: 'CheckRun',
    databaseId: 1,
    name: 'Prepare',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
    startedAt: '2026-09-29T21:53:09Z',
    checkSuite: {
      databaseId: 1,
      workflowRun: { event: 'pull_request', workflow: { name: 'CI' } },
    },
    ...overrides,
  });

  it('fetches all pages before replacing an earlier failed check', async () => {
    const commits = makeRollup([attempt({ conclusion: 'FAILURE' })], 'FAILURE');
    const node = makeNode(commits);
    const rollup = commits.commits.nodes[0]!.commit.statusCheckRollup;
    Object.assign(rollup, { id: 'rollup1' });
    rollup.contexts.pageInfo = {
      hasNextPage: true,
      endCursor: 'page1',
    } as typeof rollup.contexts.pageInfo;
    const client = makeClient([node]);
    vi.mocked(client.graphql)
      .mockResolvedValueOnce({
        repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [node] } },
      })
      .mockResolvedValueOnce({ nodes: [node] })
      .mockResolvedValueOnce({
        node: {
          contexts: {
            pageInfo: { hasNextPage: true, endCursor: 'page2' },
            nodes: [attempt({ name: 'Test API' })],
          },
        },
      })
      .mockResolvedValueOnce({
        node: {
          contexts: {
            pageInfo: { hasNextPage: false, endCursor: 'page3' },
            nodes: [attempt({ databaseId: 2, startedAt: '2026-09-29T22:02:32Z' })],
          },
        },
      });

    const [pr] = await pollOpenPrsAggregate(client, 'octocat', 'hello-world');
    expect(pr!.overallStatus).toBe('green');
    expect(pr!.failedCheckNames).toEqual([]);
    expect(pr!.passedCount).toBe(2);
    expect(pr!.totalCheckCount).toBe(2);
    expect(client.graphql).toHaveBeenNthCalledWith(3, POLL_CHECK_CONTEXTS_QUERY, {
      id: 'rollup1',
      after: 'page1',
    });
    expect(client.graphql).toHaveBeenNthCalledWith(4, POLL_CHECK_CONTEXTS_QUERY, {
      id: 'rollup1',
      after: 'page2',
    });
  });

  it('keeps the identity of the latest completed checks for related CI failures', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup([
          attempt({ databaseId: 5, conclusion: 'FAILURE', startedAt: '2026-09-29T21:00:00Z' }),
          attempt({
            databaseId: 9,
            conclusion: 'FAILURE',
            startedAt: '2026-09-29T22:00:00Z',
            completedAt: '2026-09-29T22:05:00Z',
            checkSuite: {
              databaseId: 4,
              app: { slug: 'github-actions' },
              workflowRun: {
                databaseId: 70,
                runNumber: 12,
                event: 'pull_request',
                workflow: { name: 'CI' },
              },
            },
          }),
          attempt({ databaseId: 11, name: 'Lint', status: 'IN_PROGRESS', conclusion: null }),
          {
            __typename: 'StatusContext',
            context: 'ci/jenkins',
            state: 'ERROR',
            createdAt: '2026-09-29T22:01:00Z',
            description: 'Build broke',
          },
        ]),
      ),
    ]);
    expect(pr!.ciJobs).toEqual([
      {
        id: 9,
        kind: 'actions',
        name: 'Prepare',
        workflowName: 'CI',
        workflowEvent: 'pull_request',
        runId: 70,
        runNumber: 12,
        checkSuiteId: 4,
        appSlug: 'github-actions',
        conclusion: 'failure',
        completedAt: '2026-09-29T22:05:00Z',
      },
      {
        id: 0,
        kind: 'status',
        name: 'ci/jenkins',
        conclusion: 'failure',
        completedAt: '2026-09-29T22:01:00Z',
        description: 'Build broke',
      },
    ]);
  });

  it('rejects incomplete pagination rather than publishing partial check results', async () => {
    const commits = makeRollup([attempt()]);
    const node = makeNode(commits);
    commits.commits.nodes[0]!.commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
    await expect(callAdapter([node])).rejects.toThrow('pagination');
  });

  it('keeps the newest failure regardless of context order', async () => {
    const success = attempt();
    const failure = attempt({
      databaseId: 2,
      conclusion: 'FAILURE',
      startedAt: '2026-09-29T22:02:32Z',
    });
    for (const contexts of [
      [success, failure],
      [failure, success],
    ]) {
      const [pr] = await callAdapter([makeNode(makeRollup(contexts))]);
      expect(pr!.overallStatus).toBe('red');
      expect(pr!.failedCheckNames).toEqual(['Prepare']);
      expect(pr!.totalCheckCount).toBe(1);
    }
  });

  it('shows a newer queued attempt as pending before it has started', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup([
          attempt({ conclusion: 'FAILURE' }),
          attempt({ databaseId: 2, status: 'QUEUED', conclusion: null, startedAt: null }),
        ]),
      ),
    ]);
    expect(pr!.overallStatus).toBe('yellow');
    expect(pr!.failedCheckNames).toEqual([]);
    expect(pr!.pendingCheckNames).toEqual(['Prepare']);
  });

  it('keeps same-named checks from different workflows, events and legacy statuses', async () => {
    const [pr] = await callAdapter([
      makeNode(
        makeRollup([
          attempt({ conclusion: 'FAILURE' }),
          attempt({
            checkSuite: { databaseId: 2, workflowRun: { event: 'push', workflow: { name: 'CI' } } },
          }),
          attempt({
            checkSuite: {
              databaseId: 3,
              workflowRun: { event: 'pull_request', workflow: { name: 'Deploy' } },
            },
          }),
          { __typename: 'StatusContext', context: 'Prepare', state: 'SUCCESS' },
        ]),
      ),
    ]);
    expect(pr!.overallStatus).toBe('red');
    expect(pr!.totalCheckCount).toBe(4);
    expect(pr!.passedCount).toBe(3);
  });

  it('shows passing checks after a failed workflow is replaced on the same commit', async () => {
    const context = (suite: number, conclusion: string, startedAt: string) => ({
      __typename: 'CheckRun',
      name: 'Prepare',
      status: 'COMPLETED',
      conclusion,
      startedAt,
      checkSuite: { databaseId: suite },
    });
    const [pr] = await callAdapter([
      makeNode(
        makeRollup(
          [
            context(99218169525, 'FAILURE', '2026-09-29T21:53:09Z'),
            context(99218165814, 'CANCELLED', '2026-09-29T21:53:04Z'),
            context(99220883002, 'SUCCESS', '2026-09-29T22:02:32Z'),
          ],
          'FAILURE',
        ),
      ),
    ]);

    expect(pr!.failedCheckNames).toEqual([]);
    expect(pr!.overallStatus).toBe('green');
    expect(pr!.passedCount).toBe(1);
    expect(pr!.totalCheckCount).toBe(1);
  });

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
    expect(pr!.pullRequest.labelColors).toEqual({ bug: 'd73a4a' });
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

  it('excludes PRs closed between discovery and summary fetches', async () => {
    const prs = await callAdapter([
      makeNode({
        state: 'MERGED',
        mergedAt: '2026-05-02T00:00:00Z',
        closedAt: '2026-05-02T00:00:00Z',
      }),
    ]);
    expect(prs).toEqual([]);
  });
});
