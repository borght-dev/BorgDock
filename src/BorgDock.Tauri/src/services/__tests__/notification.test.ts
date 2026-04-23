import { describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import {
  buildAllChecksPassedNotification,
  buildBecameMergeableNotification,
  buildCheckFailedNotification,
  buildClaudeReviewCriticalNotification,
  buildFixCommittedNotification,
  buildPrMergedNotification,
  buildReviewNudgeNotification,
  buildReviewRequestedNotification,
  detectStateTransitions,
  isReadyToMerge,
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
    requestedReviewers: [],
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

  it('builds PR merged notification', () => {
    const notification = buildPrMergedNotification(pr);

    expect(notification.title).toContain('PR #42 merged');
    expect(notification.severity).toBe('merged');
    expect(notification.prNumber).toBe(42);
    expect(notification.actions).toHaveLength(1);
    expect(notification.actions[0]!.label).toBe('View on GitHub');
  });

  it('builds fix committed notification', () => {
    const notification = buildFixCommittedNotification(pr);

    expect(notification.title).toBe('Fix committed');
    expect(notification.severity).toBe('success');
    expect(notification.message).toContain('#42');
  });

  it('builds became mergeable notification', () => {
    const notification = buildBecameMergeableNotification(pr);

    expect(notification.title).toBe('PR ready to merge');
    expect(notification.severity).toBe('success');
    expect(notification.actions).toHaveLength(2);
    expect(notification.actions[0]!.label).toBe('Merge');
    expect(notification.actions[0]!.url).toContain('borgdock://merge/');
    expect(notification.actions[1]!.label).toBe('Open in GitHub');
  });

  it('builds review nudge notification with fresh tier', () => {
    const notification = buildReviewNudgeNotification(pr, '30m', 'fresh');

    expect(notification.title).toBe('Review waiting 30m');
    expect(notification.severity).toBe('info');
    expect(notification.actions[0]!.label).toBe('Start Review');
    expect(notification.launchUrl).toContain('/files');
  });

  it('builds review nudge notification with aging tier', () => {
    const notification = buildReviewNudgeNotification(pr, '4h', 'aging');

    expect(notification.title).toBe('Review waiting 4h');
    expect(notification.severity).toBe('warning');
  });

  it('builds review nudge notification with stale tier', () => {
    const notification = buildReviewNudgeNotification(pr, '2d', 'stale');

    expect(notification.title).toBe('Urgent: Review waiting 2d');
    expect(notification.severity).toBe('error');
  });
});

describe('isReadyToMerge', () => {
  it('returns true when all conditions are met', () => {
    const pr = makePrWithChecks({
      overallStatus: 'green',
      pr: { isDraft: false, mergeable: true, reviewStatus: 'approved' },
    });
    expect(isReadyToMerge(pr)).toBe(true);
  });

  it('returns false when status is not green', () => {
    const pr = makePrWithChecks({
      overallStatus: 'red',
      pr: { isDraft: false, mergeable: true, reviewStatus: 'approved' },
    });
    expect(isReadyToMerge(pr)).toBe(false);
  });

  it('returns false when PR is a draft', () => {
    const pr = makePrWithChecks({
      overallStatus: 'green',
      pr: { isDraft: true, mergeable: true, reviewStatus: 'approved' },
    });
    expect(isReadyToMerge(pr)).toBe(false);
  });

  it('returns false when mergeable is false', () => {
    const pr = makePrWithChecks({
      overallStatus: 'green',
      pr: { isDraft: false, mergeable: false, reviewStatus: 'approved' },
    });
    expect(isReadyToMerge(pr)).toBe(false);
  });

  it('returns false when review status is not approved', () => {
    const pr = makePrWithChecks({
      overallStatus: 'green',
      pr: { isDraft: false, mergeable: true, reviewStatus: 'changesRequested' },
    });
    expect(isReadyToMerge(pr)).toBe(false);
  });

  it('returns true when mergeable is undefined (not explicitly false)', () => {
    const pr = makePrWithChecks({
      overallStatus: 'green',
      pr: { isDraft: false, reviewStatus: 'approved' },
    });
    expect(isReadyToMerge(pr)).toBe(true);
  });
});

describe('detectStateTransitions - additional cases', () => {
  it('detects merged transition', () => {
    const old = [makePrWithChecks({ pr: { mergedAt: undefined } })];
    const cur = [makePrWithChecks({ pr: { mergedAt: '2025-01-17T10:00:00Z' } })];

    const transitions = detectStateTransitions(old, cur);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('merged');
  });

  it('detects became mergeable transition', () => {
    const old = [
      makePrWithChecks({
        overallStatus: 'yellow',
        pr: { isDraft: false, mergeable: true, reviewStatus: 'approved' },
      }),
    ];
    const cur = [
      makePrWithChecks({
        overallStatus: 'green',
        pr: { isDraft: false, mergeable: true, reviewStatus: 'approved' },
      }),
    ];

    const transitions = detectStateTransitions(old, cur);

    const mergeable = transitions.filter((t) => t.type === 'becameMergeable');
    expect(mergeable).toHaveLength(1);
  });

  it('detects review requested transition', () => {
    const old = [makePrWithChecks({ pr: { requestedReviewers: [] } })];
    const cur = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];

    const transitions = detectStateTransitions(old, cur, 'alice');

    const reviewReq = transitions.filter((t) => t.type === 'reviewRequested');
    expect(reviewReq).toHaveLength(1);
    expect(reviewReq[0]!.detail).toBe('alice');
  });

  it('does not detect review requested when user was already a reviewer', () => {
    const old = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];
    const cur = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];

    const transitions = detectStateTransitions(old, cur, 'alice');

    const reviewReq = transitions.filter((t) => t.type === 'reviewRequested');
    expect(reviewReq).toHaveLength(0);
  });

  it('review requested is case-insensitive', () => {
    const old = [makePrWithChecks({ pr: { requestedReviewers: [] } })];
    const cur = [makePrWithChecks({ pr: { requestedReviewers: ['Alice'] } })];

    const transitions = detectStateTransitions(old, cur, 'alice');

    const reviewReq = transitions.filter((t) => t.type === 'reviewRequested');
    expect(reviewReq).toHaveLength(1);
  });

  it('does not detect review requested when no username provided', () => {
    const old = [makePrWithChecks({ pr: { requestedReviewers: [] } })];
    const cur = [makePrWithChecks({ pr: { requestedReviewers: ['alice'] } })];

    const transitions = detectStateTransitions(old, cur);

    const reviewReq = transitions.filter((t) => t.type === 'reviewRequested');
    expect(reviewReq).toHaveLength(0);
  });
});

describe('sendOsNotification', () => {
  it('calls invoke with the correct parameters', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: mockInvoke,
    }));

    // Re-import to pick up the mock
    vi.resetModules();
    const { sendOsNotification: send } = await import('../notification');

    await send({
      title: 'Test',
      body: 'Test body',
      prOwner: 'owner',
      prRepo: 'repo',
      prNumber: 42,
      buttons: [{ label: 'Click', action: 'open' }],
    });

    expect(mockInvoke).toHaveBeenCalledWith('send_notification', {
      title: 'Test',
      body: 'Test body',
      prOwner: 'owner',
      prRepo: 'repo',
      prNumber: 42,
      buttons: [{ label: 'Click', action: 'open' }],
    });
  });
});
