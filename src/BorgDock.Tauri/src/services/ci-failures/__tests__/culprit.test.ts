import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadGroup = vi.fn();
const branchWatch = vi.fn();
vi.mock('@/services/ci-failures/store-api', () => ({
  loadGroup: (id: string) => loadGroup(id),
  branchWatch: (scope: string) => branchWatch(scope),
}));
vi.mock('@/generated/commands', () => ({ commands: {} }));

const get = vi.fn();
const post = vi.fn();
const graphql = vi.fn();
const client = { get, post, graphql };
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => client }));

import { __resetWorkflowRunCacheForTests, type ComparedCommit } from '@/services/github/actions';
import { makeDetail, makeGroup } from '../__fixtures__/store';
import {
  __resetBranchStoriesForTests,
  askAuthorMessage,
  type BranchStory,
  branchStoryOf,
  openRevert,
  prNumberOf,
  recoveredRunOf,
  soleSuspectOf,
  storyLine,
  suspectsOf,
} from '../culprit';

const WORKFLOW = '.github/workflows/ci.yml';

const run = (id: number, number: number, sha: string, extra: object = {}) => ({
  id,
  run_number: number,
  head_sha: sha,
  head_branch: 'master',
  workflow_id: 7,
  path: WORKFLOW,
  html_url: `https://github.com/acme/app/actions/runs/${id}`,
  created_at: '2026-10-27T10:00:00Z',
  ...extra,
});

function commit(
  sha: string,
  message: string,
  parents: string[] = ['p'],
  login: string | null = 'alice',
): ComparedCommit {
  return {
    sha,
    title: message.split('\n')[0] ?? '',
    message,
    authorLogin: login,
    htmlUrl: null,
    parents,
  };
}

const story = (overrides: Partial<BranchStory> = {}): BranchStory => ({
  branch: 'master',
  firstRed: { runId: 300, runNumber: 41, sha: 'red', url: 'https://x/runs/300' },
  lastGreen: { runId: 290, runNumber: 40, sha: 'green', url: 'https://x/runs/290' },
  commits: [],
  commitCount: 0,
  suspects: [],
  unresolved: [],
  newestRed: { runId: 305, workflow: WORKFLOW },
  recovered: null,
  ...overrides,
});

const suspect = (number: number, authorLogin: string | null = 'alice') => ({
  number,
  title: `PR ${number}`,
  authorLogin,
  url: '',
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  graphql.mockReset();
  loadGroup.mockReset();
  branchWatch.mockReset();
  __resetWorkflowRunCacheForTests();
  __resetBranchStoriesForTests();
});

describe('prNumberOf', () => {
  it('reads squash and merge commit titles', () => {
    expect(prNumberOf('Bump checkout (#123)')).toBe(123);
    expect(prNumberOf('Merge pull request #77 from acme/feat')).toBe(77);
    expect(prNumberOf('Fix the cart (see #12) for real')).toBeNull();
  });
});

describe('suspectsOf', () => {
  const pulls = (number: number, title: string, login: string) => ({
    number,
    title,
    authorLogin: login,
  });

  it('names the PRs of squash and merge commits and leaves the commits a merge brought in alone', async () => {
    const suspects = await suspectsOf(client as never, 'acme', 'app', [
      commit('a', 'Bump checkout (#123)', ['base']),
      commit('i1', 'Inner work', ['base']),
      commit('i2', 'More inner work', ['i1']),
      commit('m', 'Merge pull request #124 from acme/x\n\nCart totals', ['a', 'i2'], 'merger'),
    ]);
    expect(suspects.suspects.map((s) => [s.number, s.title, s.authorLogin])).toEqual([
      [123, 'Bump checkout', 'alice'],
      // The merge commit's author merged it; the PR's author is unknown here.
      [124, 'Cart totals', null],
    ]);
    expect(suspects.unresolved).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('looks up a rebased commit next to a squash merge, so neither is taken for the only suspect', async () => {
    get.mockResolvedValueOnce([
      { number: 9, title: 'Rebased change', merged_at: '2026-10-27', user: { login: 'kai' } },
    ]);
    const result = await suspectsOf(client as never, 'acme', 'app', [
      commit('a', 'Bump checkout (#123)'),
      commit('r', 'Rebased change', ['a'], 'kai'),
    ]);
    expect(get).toHaveBeenCalledWith('repos/acme/app/commits/r/pulls');
    expect(result.suspects.map((s) => s.number)).toEqual([123, 9]);
    expect(soleSuspectOf(story(result))).toBeNull();
  });

  it('keeps a commit without a PR, and any past the lookup limit, as unresolved', async () => {
    get.mockResolvedValue([]);
    const result = await suspectsOf(client as never, 'acme', 'app', [
      commit('a', 'Bump checkout (#123)'),
      ...['d1', 'd2', 'd3', 'd4'].map((sha) => commit(sha, `Direct ${sha}`)),
    ]);
    expect(get).toHaveBeenCalledTimes(3);
    expect(result.unresolved.map((c) => c.sha)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(soleSuspectOf(story(result))).toBeNull();
  });

  it('asks GitHub who wrote the only suspect of a merge commit', async () => {
    get.mockResolvedValueOnce({ title: 'Cart totals', user: { login: 'jules' } });
    const result = await suspectsOf(client as never, 'acme', 'app', [
      commit('m', 'Merge pull request #124 from acme/x', ['base', 'i'], 'merger'),
    ]);
    expect(get).toHaveBeenCalledWith('repos/acme/app/pulls/124');
    expect(result.suspects).toEqual([
      {
        number: 124,
        title: 'Cart totals',
        authorLogin: 'jules',
        url: 'https://github.com/acme/app/pull/124',
      },
    ]);
  });

  it('takes a looked-up PR as it is', async () => {
    get.mockResolvedValueOnce(
      [pulls(9, 'Rebased change', 'kai')].map((p) => ({
        number: p.number,
        title: p.title,
        merged_at: '2026-10-27',
        user: { login: p.authorLogin },
      })),
    );
    const result = await suspectsOf(client as never, 'acme', 'app', [
      commit('r', 'Rebased change'),
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.suspects[0]).toMatchObject({ number: 9, authorLogin: 'kai' });
  });
});

describe('storyLine', () => {
  it('names one suspect', () => {
    const line = storyLine(
      story({
        suspects: [{ ...suspect(123), title: 'Bump checkout' }],
        commits: [commit('a', 'x')],
      }),
    );
    expect(line).toBe('Broke after #123 by alice: Bump checkout');
  });

  it('counts several suspects between the two runs', () => {
    const suspects = [1, 2, 3].map((n) => suspect(n));
    expect(storyLine(story({ suspects, commits: [commit('a', 'x')] }))).toBe(
      'Broke in one of 3 PRs merged between run #40 (passed) and run #41',
    );
  });

  it('counts a PR and a direct push as two changes', () => {
    const push = commit('d1abcdef', 'Hotfix config');
    expect(storyLine(story({ suspects: [suspect(1)], unresolved: [push], commits: [push] }))).toBe(
      'Broke in one of 2 changes pushed between run #40 (passed) and run #41',
    );
  });

  it('names a lone direct push', () => {
    const push = commit('d1abcdef', 'Hotfix config');
    expect(storyLine(story({ unresolved: [push], commits: [push] }))).toBe(
      'Broke after commit d1abcde by alice: Hotfix config',
    );
  });

  it('calls a pass on the same commit flaky', () => {
    expect(storyLine(story())).toBe('run #40 passed on the same commit as run #41: likely flaky');
  });

  it('says when there is nothing to compare with', () => {
    expect(storyLine(story({ lastGreen: null }))).toBe(
      'First failed on master in run #41; no earlier passing run to compare with.',
    );
  });
});

describe('recoveredRunOf', () => {
  it('is the branch watch’s newer pass of the same workflow', async () => {
    branchWatch.mockResolvedValue([
      {
        scope: 's',
        workflowPath: WORKFLOW,
        lastFailedRun: 305,
        lastPassedRun: 310,
        checkedAt: null,
      },
    ]);
    expect(await recoveredRunOf('s', { runId: 305, workflow: WORKFLOW })).toMatchObject({
      runId: 310,
    });
    expect(await recoveredRunOf('s', { runId: 311, workflow: WORKFLOW })).toBeNull();
    expect(await recoveredRunOf('s', { runId: 305, workflow: 'other.yml' })).toBeNull();
  });
});

describe('branchStoryOf', () => {
  const group = makeGroup({ id: 'g1', defaultBranchRuns: [41, 42], prNumbers: [1, 2] });

  function seed(lastPassedRun: number) {
    loadGroup.mockResolvedValue({
      summary: group,
      occurrences: [
        makeDetail({ id: 'pr', source: 'pull_request', runId: 500 }),
        makeDetail({
          id: 'b2',
          source: 'default_branch',
          prNumber: null,
          runId: 305,
          workflowId: 7,
          workflowPath: WORKFLOW,
        }),
        makeDetail({
          id: 'b1',
          source: 'default_branch',
          prNumber: null,
          runId: 300,
          workflowId: 7,
          workflowPath: WORKFLOW,
        }),
      ],
      candidates: [],
      decisions: [],
      claimEvents: [],
    });
    branchWatch.mockResolvedValue([
      {
        scope: group.scope,
        workflowPath: WORKFLOW,
        lastFailedRun: 305,
        lastPassedRun,
        checkedAt: null,
      },
    ]);
    get.mockImplementation(async (path: string) => {
      if (path === 'repos/acme/app/actions/runs/300') return run(300, 41, 'red');
      if (path.startsWith('repos/acme/app/actions/workflows/7/runs?')) {
        expect(path).toContain('branch=master');
        expect(path).toContain('status=success');
        expect(path).toContain(`created=${encodeURIComponent('<2026-10-27T10:00:00Z')}`);
        return { workflow_runs: [run(290, 40, 'green')] };
      }
      if (path.startsWith('repos/acme/app/compare/green...red')) {
        return {
          total_commits: 1,
          commits: [
            {
              sha: 'c1',
              commit: { message: 'Bump checkout (#123)\n\nMore words' },
              author: { login: 'alice' },
              parents: [{ sha: 'green' }],
            },
          ],
        };
      }
      if (path === 'repos/acme/app/pulls/123')
        return { title: 'Bump checkout', user: { login: 'alice' } };
      throw new Error(`unexpected ${path}`);
    });
  }

  it('finds the PR merged between the last pass and the first failure', async () => {
    seed(290);
    const result = await branchStoryOf(group);
    expect(result?.firstRed).toMatchObject({ runId: 300, runNumber: 41, sha: 'red' });
    expect(result?.lastGreen).toMatchObject({ runId: 290, runNumber: 40, sha: 'green' });
    expect(result?.suspects.map((s) => s.number)).toEqual([123]);
    expect(result?.newestRed).toEqual({ runId: 305, workflow: WORKFLOW });
    expect(result?.commitCount).toBe(1);
    expect(result && soleSuspectOf(result)?.number).toBe(123);
    expect(result?.recovered).toBeNull();
  });

  it('is recovered once the branch watch saw the workflow pass after the newest failure', async () => {
    seed(310);
    expect((await branchStoryOf(group))?.recovered).toMatchObject({ runId: 310 });
  });

  it('reads GitHub once for the strip and the Checks tab', async () => {
    seed(290);
    await Promise.all([branchStoryOf(group), branchStoryOf(group)]);
    expect(loadGroup).toHaveBeenCalledTimes(1);
  });

  it('is null for a group that never failed on the default branch', async () => {
    expect(await branchStoryOf(makeGroup({ defaultBranchRuns: [] }))).toBeNull();
    expect(loadGroup).not.toHaveBeenCalled();
  });
});

describe('asking and reverting', () => {
  const only = { number: 123, title: 'Bump checkout', authorLogin: 'alice', url: '' };

  it('writes a comment that mentions the author, the runs and the blocked PRs', () => {
    const message = askAuthorMessage({
      suspect: only,
      story: story({ suspects: [only] }),
      failure: 'checkout > pays with card',
      blockedPrs: [12, 15],
    });
    expect(message).toContain('@alice `checkout > pays with card` fails on `master`');
    expect(message).toContain('[run #41](https://x/runs/300) fails');
    expect(message).toContain('[run #40](https://x/runs/290) before it passed');
    expect(message).toContain('It also fails in 2 open pull requests: #12, #15.');
  });

  it('opens the revert as a draft', async () => {
    graphql
      .mockResolvedValueOnce({
        repository: { pullRequest: { id: 'PR_1', title: 'Bump checkout' } },
      })
      .mockResolvedValueOnce({
        revertPullRequest: {
          revertPullRequest: { url: 'https://github.com/acme/app/pull/130', number: 130 },
        },
      });
    const url = await openRevert(makeGroup(), only, story({ suspects: [only] }));
    expect(url).toBe('https://github.com/acme/app/pull/130');
    const [mutation, variables] = graphql.mock.calls[1] ?? [];
    expect(mutation).toContain('draft: true');
    expect(variables).toMatchObject({ id: 'PR_1', title: 'Revert "Bump checkout"' });
  });
});

describe('attribution edge cases', () => {
  it('keeps a direct push that a merged branch was based on as its own change', async () => {
    get.mockResolvedValue([]);
    const result = await suspectsOf(client as never, 'acme', 'app', [
      commit('d', 'Direct push to master', ['green']),
      commit('f', 'Feature work', ['d']),
      commit('m', 'Merge pull request #124 from acme/f\n\nFeature', ['d', 'f'], 'merger'),
    ]);
    expect(result.suspects.map((s) => s.number)).toEqual([124]);
    expect(result.unresolved.map((c) => c.sha)).toEqual(['d']);
    expect(soleSuspectOf(story({ ...result, commits: [], commitCount: 0 }))).toBeNull();
  });

  it('names no single suspect when GitHub listed only the first page of commits', () => {
    const only = suspect(123);
    const truncated = story({
      suspects: [only],
      commits: [commit('a', 'Bump checkout (#123)')],
      commitCount: 150,
    });
    expect(soleSuspectOf(truncated)).toBeNull();
    expect(storyLine(truncated)).toBe(
      'Broke in one of 150 commits pushed between run #40 (passed) and run #41',
    );
    expect(soleSuspectOf({ ...truncated, commitCount: 1 })).toEqual(only);
  });
});
