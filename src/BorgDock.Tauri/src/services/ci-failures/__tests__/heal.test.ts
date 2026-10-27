import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/ci-failures/store-api', () => ({}));
vi.mock('@/generated/commands', () => ({ commands: {} }));

const put = vi.fn();
const post = vi.fn();
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({ put, post }) }));

import { GitHubApiError } from '@/services/github/client';
import type { PullRequestWithChecks } from '@/types';
import { makeGroup } from '../__fixtures__/store';
import { healModeOf, type RerunTarget, updateAffected } from '../rerun';

function target(number: number): RerunTarget {
  return {
    pr: {
      pullRequest: { number, repoOwner: 'acme', repoName: 'app', headSha: `head${number}` },
    } as unknown as PullRequestWithChecks,
    checks: [
      {
        id: number * 10,
        name: 'e2e',
        status: 'completed',
        conclusion: 'failure',
        htmlUrl: `https://github.com/acme/app/actions/runs/${number}/job/${number * 10}`,
        checkSuiteId: 0,
      },
    ],
    workflowRunIds: [number],
  };
}

beforeEach(() => {
  put.mockReset();
  post.mockReset();
});

describe('healModeOf', () => {
  it('updates branches once a fix is on the base branch', () => {
    expect(healModeOf(makeGroup({ fixMergedAt: '2026-10-27T10:00:00Z' }), false)).toBe('update');
    expect(healModeOf(makeGroup({ defaultBranchRuns: [41], prNumbers: [1] }), true)).toBe('update');
  });

  it('reruns a cause that was never the code', () => {
    expect(healModeOf(makeGroup({ catalogIds: ['runner-lost'] }), false)).toBe('rerun');
    expect(healModeOf(makeGroup({ passedOnRetry: 1, runCount: 3 }), false)).toBe('rerun');
  });

  it('offers nothing while the base branch is still red or the cause may be the PRs', () => {
    expect(healModeOf(makeGroup({ defaultBranchRuns: [41], prNumbers: [1] }), false)).toBeNull();
    expect(healModeOf(makeGroup({ prNumbers: [1, 2] }), false)).toBeNull();
    expect(
      healModeOf(makeGroup({ fixMergedAt: '2026-10-27T10:00:00Z', status: 'resolved' }), true),
    ).toBeNull();
  });
});

describe('updateAffected', () => {
  it('updates each branch from its base, guarded by the head it saw', async () => {
    put.mockResolvedValue({ message: 'Updating pull request branch.' });
    const outcomes = await updateAffected([target(1), target(2)]);
    expect(put.mock.calls).toEqual([
      ['repos/acme/app/pulls/1/update-branch', { expected_head_sha: 'head1' }],
      ['repos/acme/app/pulls/2/update-branch', { expected_head_sha: 'head2' }],
    ]);
    expect(outcomes).toEqual([
      { prNumber: 1, action: 'updated', error: null },
      { prNumber: 2, action: 'updated', error: null },
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it('reruns the failed jobs of a branch that already has its base', async () => {
    put.mockRejectedValue(
      new GitHubApiError(
        'GitHub API error: 422 — There are no new commits on the base branch.',
        422,
      ),
    );
    const outcomes = await updateAffected([target(3)]);
    expect(post).toHaveBeenCalledWith('repos/acme/app/actions/runs/3/rerun-failed-jobs', {});
    expect(outcomes).toEqual([{ prNumber: 3, action: 'rerun', error: null }]);
  });

  it('reports a conflict without rerunning', async () => {
    put.mockRejectedValue(
      new GitHubApiError('GitHub API error: 422 — merge conflict between base and head', 422),
    );
    const outcomes = await updateAffected([target(4)]);
    expect(post).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ prNumber: 4, action: null });
    expect(outcomes[0]?.error).toContain('merge conflict');
  });
});
