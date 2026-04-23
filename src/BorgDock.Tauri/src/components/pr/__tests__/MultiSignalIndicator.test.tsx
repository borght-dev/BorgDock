import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { MultiSignalIndicator } from '../MultiSignalIndicator';

afterEach(cleanup);

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 1,
      title: 'Test PR',
      headRef: 'feature/test',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      mergeable: true,
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
      requestedReviewers: [],
      ...overrides.pullRequest,
    },
    checks: overrides.checks ?? [],
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.failedCheckNames ?? [],
    pendingCheckNames: overrides.pendingCheckNames ?? [],
    passedCount: overrides.passedCount ?? 0,
    skippedCount: overrides.skippedCount ?? 0,
  };
}

describe('MultiSignalIndicator', () => {
  describe('SegmentRing style (default)', () => {
    it('renders an SVG with aria-label showing signal colors', () => {
      const pr = makePr({
        checks: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            htmlUrl: '',
            checkSuiteId: 1,
          },
        ],
        passedCount: 1,
        pullRequest: {
          reviewStatus: 'approved',
          mergeable: true,
          isDraft: false,
        } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      const svg = screen.getByLabelText(/CI:.*Review:.*Conflicts:.*Draft:/);
      expect(svg).toBeInTheDocument();
    });

    it('shows red CI signal when checks fail', () => {
      const pr = makePr({
        checks: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'failure',
            htmlUrl: '',
            checkSuiteId: 1,
          },
        ],
        failedCheckNames: ['build'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/CI: red/)).toBeInTheDocument();
    });

    it('shows yellow CI signal when checks are pending', () => {
      const pr = makePr({
        checks: [{ id: 1, name: 'build', status: 'in_progress', htmlUrl: '', checkSuiteId: 1 }],
        pendingCheckNames: ['build'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/CI: yellow/)).toBeInTheDocument();
    });

    it('shows gray CI signal when there are no checks', () => {
      const pr = makePr({ checks: [] });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/CI: gray/)).toBeInTheDocument();
    });

    it('shows green review signal for approved', () => {
      const pr = makePr({
        pullRequest: { reviewStatus: 'approved' } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Review: green/)).toBeInTheDocument();
    });

    it('shows red review signal for changesRequested', () => {
      const pr = makePr({
        pullRequest: { reviewStatus: 'changesRequested' } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Review: red/)).toBeInTheDocument();
    });

    it('shows yellow review signal for pending', () => {
      const pr = makePr({
        pullRequest: { reviewStatus: 'pending' } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Review: yellow/)).toBeInTheDocument();
    });

    it('shows red conflict signal when mergeable is false', () => {
      const pr = makePr({
        pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Conflicts: red/)).toBeInTheDocument();
    });

    it('shows green conflict signal when mergeable is true', () => {
      const pr = makePr({
        pullRequest: { mergeable: true } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Conflicts: green/)).toBeInTheDocument();
    });

    it('shows yellow draft signal for draft PRs', () => {
      const pr = makePr({
        pullRequest: { isDraft: true } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Draft: yellow/)).toBeInTheDocument();
    });

    it('shows green draft signal for non-draft PRs', () => {
      const pr = makePr({
        pullRequest: { isDraft: false } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} />);
      expect(screen.getByLabelText(/Draft: green/)).toBeInTheDocument();
    });

    it('respects custom size', () => {
      const pr = makePr();
      const { container } = render(<MultiSignalIndicator pr={pr} size={32} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('32');
      expect(svg?.getAttribute('height')).toBe('32');
    });
  });

  describe('ProgressArc style', () => {
    it('renders with merge score aria-label', () => {
      const pr = makePr({
        pullRequest: {
          reviewStatus: 'approved',
          mergeable: true,
          isDraft: false,
        } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} style="ProgressArc" />);
      expect(screen.getByLabelText(/Merge score: \d+%/)).toBeInTheDocument();
    });

    it('shows 100% for a fully ready PR', () => {
      const pr = makePr({
        checks: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            htmlUrl: '',
            checkSuiteId: 1,
          },
        ],
        passedCount: 1,
        skippedCount: 0,
        pullRequest: {
          reviewStatus: 'approved',
          mergeable: true,
          isDraft: false,
        } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} style="ProgressArc" />);
      expect(screen.getByLabelText('Merge score: 100%')).toBeInTheDocument();
    });

    it('shows reduced score for draft PRs', () => {
      const pr = makePr({
        pullRequest: {
          reviewStatus: 'approved',
          mergeable: true,
          isDraft: true,
        } as PullRequestWithChecks['pullRequest'],
      });
      render(<MultiSignalIndicator pr={pr} style="ProgressArc" />);
      expect(screen.getByLabelText('Merge score: 75%')).toBeInTheDocument();
    });
  });
});
