import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { ReadinessLine, readinessFor } from '../ReadinessLine';

interface Shape {
  pr?: Partial<PullRequest>;
  failing?: number;
  running?: number;
  passed?: number;
  skipped?: number;
}

function make({ pr = {}, failing = 0, running = 0, passed = 5, skipped = 0 }: Shape = {}) {
  const prw: PullRequestWithChecks = {
    pullRequest: {
      number: 1,
      title: 'Change',
      headRef: 'feat/x',
      baseRef: 'main',
      authorLogin: 'koen',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-09-20T10:00:00Z',
      updatedAt: '2026-09-24T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: '',
      body: '',
      repoOwner: 'acme',
      repoName: 'app',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 0,
      requestedReviewers: [],
      ...pr,
    },
    overallStatus: failing > 0 ? 'red' : running > 0 ? 'yellow' : 'green',
    failedCheckNames: Array.from({ length: failing }, (_, i) => `fail ${i}`),
    failedCheckSuiteIds: Array.from({ length: failing }, () => 1),
    pendingCheckNames: Array.from({ length: running }, (_, i) => `run ${i}`),
    passedCount: passed,
    skippedCount: skipped,
    totalCheckCount: failing + running + passed + skipped,
  };
  return prw;
}

describe('readinessFor', () => {
  it.each<[string, Shape, string, string]>([
    ['failing checks', { failing: 2 }, 'bad', 'Not ready: 2 checks failing'],
    ['one failing check', { failing: 1 }, 'bad', 'Not ready: 1 check failing'],
    ['conflicts', { pr: { mergeable: false } }, 'bad', 'Not ready: merge conflicts with main'],
    [
      'failing checks and conflicts',
      { failing: 1, pr: { mergeable: false } },
      'bad',
      'Not ready: 1 check failing and merge conflicts with main',
    ],
    [
      'a draft with conflicts',
      { pr: { isDraft: true, mergeable: false, baseRef: 'develop' } },
      'bad',
      'Draft: merge conflicts with develop',
    ],
    [
      'a draft with failing checks',
      { failing: 3, pr: { isDraft: true } },
      'bad',
      'Draft: 3 checks failing',
    ],
    [
      'a draft',
      { pr: { isDraft: true, reviewStatus: 'approved' } },
      'neutral',
      'Draft: not ready for review',
    ],
    ['running checks', { running: 3 }, 'run', 'Waiting: 3 checks still running'],
    [
      'approved, all green',
      { pr: { reviewStatus: 'approved' } },
      'ok',
      'Ready to merge: approved, all checks passed',
    ],
    [
      'approved without checks',
      { passed: 0, pr: { reviewStatus: 'approved' } },
      'ok',
      'Ready to merge: approved',
    ],
    [
      'changes requested',
      { pr: { reviewStatus: 'changesRequested' } },
      'run',
      'Waiting: changes requested',
    ],
    [
      'comments',
      { pr: { reviewStatus: 'commented' } },
      'run',
      'Waiting: review comments to answer',
    ],
    ['review pending', { pr: { reviewStatus: 'pending' } }, 'run', 'Waiting for review'],
    ['no review yet', {}, 'run', 'Waiting for review'],
    [
      'merged',
      { failing: 1, pr: { state: 'closed', mergedAt: '2026-09-24T12:00:00Z' } },
      'neutral',
      'Merged',
    ],
    [
      'closed',
      { pr: { state: 'closed', closedAt: '2026-09-24T12:00:00Z' } },
      'neutral',
      'Closed without merging',
    ],
  ])('%s', (_name, shape, tone, text) => {
    expect(readinessFor(make(shape))).toEqual({ tone, text });
  });

  it('puts failing checks ahead of running ones', () => {
    expect(readinessFor(make({ failing: 1, running: 4 })).text).toBe('Not ready: 1 check failing');
  });
});

describe('ReadinessLine', () => {
  it('renders the sentence with its tone', () => {
    render(<ReadinessLine pr={make({ failing: 2 })} />);
    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('Not ready: 2 checks failing');
    expect(line).toHaveAttribute('data-tone', 'bad');
  });
});
