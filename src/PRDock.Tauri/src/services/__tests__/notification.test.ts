import { describe, expect, it } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import {
  buildAllChecksPassedNotification,
  buildCheckFailedNotification,
  buildClaudeReviewCriticalNotification,
  buildReviewRequestedNotification,
  detectStateTransitions,
} from '../notification';

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Test PR',
    headRef: 'feature',
    baseRef: 'main',
    authorLogin: 'alice',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-01-16T10:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/owner/repo/pull/42',
    body: '',
    repoOwner: 'owner',
    repoName: 'repo',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 1,
    ...overrides,
  };
}

function makePrWithChecks(
  overrides: Partial<PullRequestWithChecks> & { pr?: Partial<PullRequest> } = {},
): PullRequestWithChecks {
  const { pr, ...rest } = overrides;
  return {
    pullRequest: makePr(pr),
    checks: [],
    overallStatus: 'gray',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    ...rest,
  };
}

describe('detectStateTransitions', () => {
  it('detects check failure transition (gray -> red)', () => {
    const old = [makePrWithChecks({ overallStatus: 'gray' })];
    const cur = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];

    const transitions = detectStateTransitions(old, cur);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('checkFailed');
    expect(transitions[0]!.detail).toBe('build');
  });

  it('detects all checks passed (yellow -> green)', () => {
    const old = [makePrWithChecks({ overallStatus: 'yellow' })];
    const cur = [makePrWithChecks({ overallStatus: 'green' })];

    const transitions = detectStateTransitions(old, cur);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('allChecksPassed');
  });

  it('detects review changes requested transition', () => {
    const old = [makePrWithChecks({ pr: { reviewStatus: 'none' } })];
    const cur = [makePrWithChecks({ pr: { reviewStatus: 'changesRequested' } })];

    const transitions = detectStateTransitions(old, cur);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('reviewChangesRequested');
  });

  it('does not detect transitions for new PRs', () => {
    const old: PullRequestWithChecks[] = [];
    const cur = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];

    const transitions = detectStateTransitions(old, cur);
    expect(transitions).toHaveLength(0);
  });

  it('does not detect same-state transitions', () => {
    const state = makePrWithChecks({ overallStatus: 'green' });
    const transitions = detectStateTransitions([state], [state]);
    expect(transitions).toHaveLength(0);
  });

  it('detects multiple new failed checks', () => {
    const old = [makePrWithChecks({ overallStatus: 'green' })];
    const cur = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build', 'test', 'lint'],
      }),
    ];

    const transitions = detectStateTransitions(old, cur);

    const checkFailed = transitions.filter((t) => t.type === 'checkFailed');
    expect(checkFailed).toHaveLength(3);
    expect(checkFailed.map((t) => t.detail)).toEqual(['build', 'test', 'lint']);
  });

  it('handles edge case: gray->red with previously known failures', () => {
    const old = [
      makePrWithChecks({
        overallStatus: 'gray',
        failedCheckNames: ['build'],
      }),
    ];
    const cur = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];

    const transitions = detectStateTransitions(old, cur);

    // Should still notify about the first failure (edge case handling)
    const checkFailed = transitions.filter((t) => t.type === 'checkFailed');
    expect(checkFailed).toHaveLength(1);
    expect(checkFailed[0]!.detail).toBe('build');
  });
});

describe('notification builders', () => {
  const pr = makePr();

  it('builds check failed notification', () => {
    const notification = buildCheckFailedNotification(pr, 'build');

    expect(notification.title).toBe('Check failed: build');
    expect(notification.severity).toBe('error');
    expect(notification.prNumber).toBe(42);
    expect(notification.actions).toHaveLength(2);
    expect(notification.actions[0]!.label).toBe('Open in GitHub');
    expect(notification.actions[1]!.label).toBe('Fix with Claude');
  });

  it('builds all checks passed notification', () => {
    const notification = buildAllChecksPassedNotification(pr);

    expect(notification.title).toBe('All checks passed');
    expect(notification.severity).toBe('success');
    expect(notification.actions).toHaveLength(1);
  });

  it('builds review requested notification', () => {
    const notification = buildReviewRequestedNotification(pr, 'bob');

    expect(notification.title).toBe('Review requested from bob');
    expect(notification.severity).toBe('warning');
  });

  it('builds Claude review critical notification', () => {
    const notification = buildClaudeReviewCriticalNotification(pr, 3);

    expect(notification.title).toBe('Claude found 3 critical issues');
    expect(notification.severity).toBe('error');
  });

  it('handles singular issue count', () => {
    const notification = buildClaudeReviewCriticalNotification(pr, 1);
    expect(notification.title).toBe('Claude found 1 critical issue');
  });
});
