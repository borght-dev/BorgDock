import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { MergeReadinessChecklist } from '../MergeReadinessChecklist';

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 1,
      title: 'Test PR',
      headRef: 'feature',
      baseRef: 'main',
      authorLogin: 'user',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/owner/repo/pull/1',
      body: '',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'approved',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 3,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

function makeCheck(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 1,
    name: 'build',
    status: 'completed',
    conclusion: 'success',
    htmlUrl: 'https://github.com/runs/1',
    checkSuiteId: 100,
    ...overrides,
  };
}

describe('MergeReadinessChecklist', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders "Merge Readiness" heading', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('Merge Readiness')).toBeTruthy();
  });

  it('shows all four checklist items', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('Checks passed')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('No conflicts')).toBeTruthy();
    expect(screen.getByText('Not draft')).toBeTruthy();
  });

  it('shows 100 score for fully ready PR', () => {
    const pr = makePr({
      checks: [makeCheck()],
      passedCount: 1,
      skippedCount: 0,
      pullRequest: {
        ...makePr().pullRequest,
        reviewStatus: 'approved',
        mergeable: true,
        isDraft: false,
      },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('shows score of 100 for PR with no checks', () => {
    // No checks = full marks for CI (25%) + approved (25%) + mergeable (25%) + not draft (25%)
    const pr = makePr();
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('shows "No CI checks configured" when no checks', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('No CI checks configured')).toBeTruthy();
  });

  it('shows checks count description', () => {
    const pr = makePr({
      checks: [makeCheck({ id: 1 }), makeCheck({ id: 2 })],
      passedCount: 2,
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('2/2 checks passed')).toBeTruthy();
  });

  it('includes skipped count in description', () => {
    const pr = makePr({
      checks: [makeCheck({ id: 1 }), makeCheck({ id: 2, conclusion: 'skipped' })],
      passedCount: 1,
      skippedCount: 1,
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('1/1 passed (1 skipped)')).toBeTruthy();
  });

  it('shows "At least one approval" for approved PRs', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('At least one approval')).toBeTruthy();
  });

  it('shows "Changes have been requested" for changesRequested', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, reviewStatus: 'changesRequested' },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('Changes have been requested')).toBeTruthy();
  });

  it('shows "Awaiting reviewer feedback" for pending reviews', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, reviewStatus: 'pending' },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('Awaiting reviewer feedback')).toBeTruthy();
  });

  it('shows "Review comments pending resolution" for commented', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, reviewStatus: 'commented' },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('Review comments pending resolution')).toBeTruthy();
  });

  it('shows "No reviews yet" for none review status', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, reviewStatus: 'none' },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('No reviews yet')).toBeTruthy();
  });

  it('shows "Branch is mergeable" when mergeable is true', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('Branch is mergeable')).toBeTruthy();
  });

  it('shows "Branch has merge conflicts" when mergeable is false', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, mergeable: false },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('Branch has merge conflicts')).toBeTruthy();
  });

  it('shows "Mergeability unknown" when mergeable is undefined', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, mergeable: undefined },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('Mergeability unknown')).toBeTruthy();
  });

  it('shows "Ready for review" when not draft', () => {
    render(<MergeReadinessChecklist pr={makePr()} />);
    expect(screen.getByText('Ready for review')).toBeTruthy();
  });

  it('shows "PR is marked as draft" when draft', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, isDraft: true },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('PR is marked as draft')).toBeTruthy();
  });

  it('shows reduced score for failed checks', () => {
    const pr = makePr({
      checks: [makeCheck({ id: 1, conclusion: 'failure' })],
      passedCount: 0,
      failedCheckNames: ['build'],
      pullRequest: {
        ...makePr().pullRequest,
        reviewStatus: 'approved',
        mergeable: true,
        isDraft: false,
      },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('75')).toBeTruthy();
  });

  it('shows 0 score for worst-case PR', () => {
    const pr = makePr({
      checks: [makeCheck({ id: 1, conclusion: 'failure' })],
      passedCount: 0,
      failedCheckNames: ['build'],
      pullRequest: {
        ...makePr().pullRequest,
        reviewStatus: 'none',
        mergeable: false,
        isDraft: true,
      },
    });
    render(<MergeReadinessChecklist pr={pr} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders progress bar segments for each item', () => {
    const { container } = render(<MergeReadinessChecklist pr={makePr()} />);
    const segments = container.querySelectorAll('.h-full.flex-1.rounded-full');
    expect(segments.length).toBe(4);
  });
});
