import { describe, expect, it } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { detectStateTransitions } from '../../services/notification';

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
  it('returns empty array when both old and new are empty', () => {
    const transitions = detectStateTransitions([], []);
    expect(transitions).toEqual([]);
  });

  it('returns empty array when no state changes', () => {
    const prs = [makePrWithChecks({ overallStatus: 'green' })];
    const transitions = detectStateTransitions(prs, prs);
    expect(transitions).toEqual([]);
  });

  it('detects check failure transition (green -> red)', () => {
    const oldPrs = [makePrWithChecks({ overallStatus: 'green' })];
    const newPrs = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('checkFailed');
    expect(transitions[0]!.pr.number).toBe(42);
  });

  it('detects all checks passed transition (red -> green)', () => {
    const oldPrs = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];
    const newPrs = [makePrWithChecks({ overallStatus: 'green' })];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('allChecksPassed');
  });

  it('detects review changes requested transition', () => {
    const oldPrs = [makePrWithChecks({ pr: { reviewStatus: 'approved' } })];
    const newPrs = [makePrWithChecks({ pr: { reviewStatus: 'changesRequested' } })];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.type).toBe('reviewChangesRequested');
  });

  it('does not report transitions for new PRs (only in newPrs, not in oldPrs)', () => {
    const oldPrs: PullRequestWithChecks[] = [];
    const newPrs = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['build'],
      }),
    ];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    expect(transitions).toEqual([]);
  });

  it('detects multiple transitions in a single poll', () => {
    const oldPrs = [
      makePrWithChecks({
        pr: { number: 1, reviewStatus: 'none' },
        overallStatus: 'yellow',
      }),
      makePrWithChecks({
        pr: { number: 2 },
        overallStatus: 'green',
      }),
    ];
    const newPrs = [
      makePrWithChecks({
        pr: { number: 1, reviewStatus: 'changesRequested' },
        overallStatus: 'green',
      }),
      makePrWithChecks({
        pr: { number: 2 },
        overallStatus: 'red',
        failedCheckNames: ['test'],
      }),
    ];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    const types = transitions.map((t) => t.type).sort();
    expect(types).toEqual(['allChecksPassed', 'checkFailed', 'reviewChangesRequested']);
  });

  it('reports the specific failed check name in the detail field', () => {
    const oldPrs = [makePrWithChecks({ overallStatus: 'green' })];
    const newPrs = [
      makePrWithChecks({
        overallStatus: 'red',
        failedCheckNames: ['ci/lint', 'ci/test'],
      }),
    ];

    const transitions = detectStateTransitions(oldPrs, newPrs);

    const checkFailedTransitions = transitions.filter((t) => t.type === 'checkFailed');
    expect(checkFailedTransitions).toHaveLength(2);
    const details = checkFailedTransitions.map((t) => t.detail);
    expect(details).toContain('ci/lint');
    expect(details).toContain('ci/test');
  });
});
