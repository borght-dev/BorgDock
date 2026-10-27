import { describe, expect, it } from 'vitest';
import type { CiJob, PullRequestWithChecks } from '@/types';
import { makeGroup } from '../__fixtures__/store';
import {
  blockedPrsByGroup,
  isBlocking,
  jobIndexOf,
  outsideCauseOf,
  outsideCauseText,
  prCiLens,
} from '../lens';

function job(id: number, conclusion = 'failure', kind: CiJob['kind'] = 'actions'): CiJob {
  return { id, kind, name: `job ${id}`, conclusion, ...(kind === 'actions' ? { runId: 1 } : {}) };
}

function pr(
  number: number,
  jobs: CiJob[],
  repo = 'app',
  failedCheckNames = jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name),
): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR ${number}`,
      headRef: `b${number}`,
      baseRef: 'master',
      authorLogin: 'mira',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '',
      updatedAt: '',
      isDraft: false,
      htmlUrl: `https://github.com/acme/${repo}/pull/${number}`,
      body: '',
      repoOwner: 'Acme',
      repoName: repo,
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 1,
      requestedReviewers: [],
    },
    overallStatus: failedCheckNames.length > 0 ? 'red' : 'green',
    failedCheckNames,
    failedCheckSuiteIds: [],
    ciJobs: jobs,
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: jobs.length,
  };
}

/** Shared by PRs 1 and 2, also on master: not the PRs' doing. */
const onMaster = makeGroup({
  id: 'master',
  title: 'checkout > pays with card',
  prNumbers: [1, 2],
  defaultBranchRuns: [41],
  prJobIds: [11, 21],
  occurrenceCount: 3,
});
/** Shared by PRs 2 and 3 only: may be theirs. */
const sharedOnly = makeGroup({
  id: 'shared',
  title: 'cart > totals',
  prNumbers: [2, 3],
  prJobIds: [22, 31],
  occurrenceCount: 2,
});

describe('outsideCauseOf', () => {
  it('reads the strongest hypothesis that says the PR did not cause it', () => {
    expect(outsideCauseOf(onMaster, 'master')).toBe('base-branch');
    expect(outsideCauseOf(makeGroup({ passedOnRetry: 1, runCount: 2 }))).toBe('flaky');
    expect(outsideCauseOf(makeGroup({ catalogIds: ['dns'] }))).toBe('infrastructure');
    expect(outsideCauseOf(sharedOnly)).toBeNull();
  });

  it('lets your classification win over the hypotheses', () => {
    expect(outsideCauseOf({ ...onMaster, classification: 'branch-specific' })).toBeNull();
    expect(outsideCauseOf({ ...sharedOnly, classification: 'infrastructure' })).toBe(
      'infrastructure',
    );
    expect(outsideCauseOf({ ...onMaster, classification: 'unknown' })).toBe('base-branch');
  });

  it('says it in a phrase', () => {
    expect(outsideCauseText('base-branch', 'main')).toBe('also fails on main');
  });
});

describe('prCiLens', () => {
  const index = jobIndexOf([onMaster, sharedOnly]);

  it('names the shared group of a failed check and the PRs it blocks', () => {
    const lens = prCiLens(pr(1, [job(11), job(12, 'success')]), index, new Map([['master', 2]]));
    expect(lens?.groups.map((g) => g.id)).toEqual(['master']);
    expect(lens?.blockedCount).toBe(2);
    expect(lens?.outsideCause).toBe('base-branch');
  });

  it('is not "not caused" when one failed check may be the PR\'s own', () => {
    const lens = prCiLens(pr(2, [job(21), job(22)]), index);
    expect(lens?.groups.map((g) => g.id).sort()).toEqual(['master', 'shared']);
    expect(lens?.outsideCause).toBeNull();
  });

  it('is not "not caused" when a failed check is in no group', () => {
    expect(prCiLens(pr(1, [job(11), job(99)]), index)?.outsideCause).toBeNull();
  });

  it("counts a failed commit status as the PR's own", () => {
    expect(prCiLens(pr(1, [job(11), job(0, 'failure', 'status')]), index)?.outsideCause).toBeNull();
  });

  it('is not "not caused" when the poll carried fewer failed jobs than failed checks', () => {
    const lens = prCiLens(pr(1, [job(11)], 'app', ['job 11', 'lint']), index);
    expect(lens?.outsideCause).toBeNull();
  });

  it('is null without a shared failed check', () => {
    expect(prCiLens(pr(5, [job(51)]), index)).toBeNull();
    expect(prCiLens(pr(5, []), index)).toBeNull();
  });

  it('never matches a job id from another repository', () => {
    expect(prCiLens(pr(1, [job(11)], 'other'), index)).toBeNull();
  });

  it('leaves resolved and medium groups out', () => {
    const quiet = jobIndexOf([
      { ...onMaster, status: 'resolved' },
      { ...sharedOnly, maxTier: 'medium' },
    ]);
    expect(prCiLens(pr(2, [job(21), job(22)]), quiet)).toBeNull();
  });
});

describe('blockedPrsByGroup', () => {
  it('lists the open PRs whose current failed checks are in each group', () => {
    const blocked = blockedPrsByGroup(
      [onMaster, sharedOnly],
      [
        pr(1, [job(11)]),
        pr(2, [job(21), job(22)]),
        // PR 3 was pushed: its new job passed, the old failure is history.
        pr(3, [job(32, 'success')]),
      ],
    );
    expect(blocked.get('master')?.map((p) => p.pullRequest.number)).toEqual([1, 2]);
    expect(blocked.get('shared')?.map((p) => p.pullRequest.number)).toEqual([2]);
  });
});

describe('isBlocking', () => {
  it('needs two open PRs, or one and the default branch', () => {
    expect(isBlocking(sharedOnly, 2)).toBe(true);
    expect(isBlocking(sharedOnly, 1)).toBe(false);
    expect(isBlocking(onMaster, 1)).toBe(true);
    expect(isBlocking(onMaster, 0)).toBe(false);
  });
});
