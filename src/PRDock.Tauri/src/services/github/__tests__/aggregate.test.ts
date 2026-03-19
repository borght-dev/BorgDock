import { describe, expect, it } from 'vitest';
import type { CheckRun, PullRequest } from '@/types';
import { aggregatePrWithChecks, computeOverallStatus } from '../aggregate';

function makeCheckRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 1,
    name: 'test-check',
    status: 'completed',
    conclusion: 'success',
    htmlUrl: 'https://github.com/test',
    checkSuiteId: 1,
    ...overrides,
  };
}

function makePullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    headRef: 'feature-branch',
    baseRef: 'main',
    authorLogin: 'testuser',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/test/repo/pull/1',
    body: '',
    repoOwner: 'test',
    repoName: 'repo',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commitCount: 1,
    ...overrides,
  };
}

describe('computeOverallStatus', () => {
  it('returns gray for empty checks array', () => {
    expect(computeOverallStatus([])).toBe('gray');
  });

  it('returns red when any check has conclusion failure', () => {
    const checks = [
      makeCheckRun({ conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'failing', conclusion: 'failure' }),
    ];
    expect(computeOverallStatus(checks)).toBe('red');
  });

  it('returns red when any check has conclusion timed_out', () => {
    const checks = [
      makeCheckRun({ conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'timeout', conclusion: 'timed_out' }),
    ];
    expect(computeOverallStatus(checks)).toBe('red');
  });

  it('returns yellow when checks are in_progress with no failures', () => {
    const checks = [
      makeCheckRun({ status: 'in_progress', conclusion: undefined }),
      makeCheckRun({ id: 2, conclusion: 'success' }),
    ];
    expect(computeOverallStatus(checks)).toBe('yellow');
  });

  it('returns yellow when checks are queued with no failures', () => {
    const checks = [
      makeCheckRun({ status: 'queued', conclusion: undefined }),
      makeCheckRun({ id: 2, conclusion: 'success' }),
    ];
    expect(computeOverallStatus(checks)).toBe('yellow');
  });

  it('returns green when all checks have conclusion success', () => {
    const checks = [
      makeCheckRun({ conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'test', conclusion: 'success' }),
    ];
    expect(computeOverallStatus(checks)).toBe('green');
  });

  it('returns green when checks are mix of success and skipped', () => {
    const checks = [
      makeCheckRun({ conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'skipped-check', conclusion: 'skipped' }),
    ];
    expect(computeOverallStatus(checks)).toBe('green');
  });

  it('returns green when checks are mix of success and neutral', () => {
    const checks = [
      makeCheckRun({ conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'neutral-check', conclusion: 'neutral' }),
    ];
    expect(computeOverallStatus(checks)).toBe('green');
  });
});

describe('aggregatePrWithChecks', () => {
  it('returns correct failedCheckNames', () => {
    const pr = makePullRequest();
    const checks = [
      makeCheckRun({ name: 'build', conclusion: 'failure' }),
      makeCheckRun({ id: 2, name: 'test', conclusion: 'success' }),
      makeCheckRun({ id: 3, name: 'deploy', conclusion: 'timed_out' }),
    ];

    const result = aggregatePrWithChecks(pr, checks);

    expect(result.failedCheckNames).toEqual(['build', 'deploy']);
  });

  it('returns correct pendingCheckNames', () => {
    const pr = makePullRequest();
    const checks = [
      makeCheckRun({ name: 'build', status: 'in_progress', conclusion: undefined }),
      makeCheckRun({ id: 2, name: 'test', status: 'queued', conclusion: undefined }),
      makeCheckRun({ id: 3, name: 'lint', status: 'completed', conclusion: 'success' }),
    ];

    const result = aggregatePrWithChecks(pr, checks);

    expect(result.pendingCheckNames).toEqual(['build', 'test']);
  });

  it('returns correct passedCount', () => {
    const pr = makePullRequest();
    const checks = [
      makeCheckRun({ name: 'build', conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'test', conclusion: 'success' }),
      makeCheckRun({ id: 3, name: 'lint', conclusion: 'failure' }),
    ];

    const result = aggregatePrWithChecks(pr, checks);

    expect(result.passedCount).toBe(2);
  });

  it('returns correct skippedCount', () => {
    const pr = makePullRequest();
    const checks = [
      makeCheckRun({ name: 'build', conclusion: 'success' }),
      makeCheckRun({ id: 2, name: 'optional', conclusion: 'skipped' }),
      makeCheckRun({ id: 3, name: 'info', conclusion: 'neutral' }),
    ];

    const result = aggregatePrWithChecks(pr, checks);

    expect(result.skippedCount).toBe(2);
  });

  it('includes the PR and checks in the result', () => {
    const pr = makePullRequest({ number: 99, title: 'My PR' });
    const checks = [makeCheckRun({ name: 'build', conclusion: 'success' })];

    const result = aggregatePrWithChecks(pr, checks);

    expect(result.pullRequest).toBe(pr);
    expect(result.checks).toBe(checks);
  });

  it('handles empty checks array', () => {
    const pr = makePullRequest();

    const result = aggregatePrWithChecks(pr, []);

    expect(result.overallStatus).toBe('gray');
    expect(result.failedCheckNames).toEqual([]);
    expect(result.pendingCheckNames).toEqual([]);
    expect(result.passedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });
});
