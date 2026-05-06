import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PullRequest } from '@/types';
import { MergedCard } from '../MergedCard';

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'T',
    headRef: 'feature-x',
    baseRef: 'main',
    authorLogin: 'dev',
    authorAvatarUrl: '',
    state: 'closed',
    createdAt: '2026-05-06T10:00:00Z',
    updatedAt: '2026-05-06T12:00:00Z',
    isDraft: false,
    htmlUrl: '',
    body: '',
    repoOwner: 'o',
    repoName: 'r',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 0,
    requestedReviewers: [],
    ...overrides,
  };
}

describe('MergedCard', () => {
  afterEach(() => cleanup());

  it('renders the merged variant with branch refs and timestamp', () => {
    const pr = makePr({
      mergedAt: new Date().toISOString(),
      headRef: 'sqlite-wal',
      baseRef: 'main',
    });
    render(<MergedCard pr={pr} />);
    expect(screen.getByText('Merged')).toBeTruthy();
    expect(screen.getByText('sqlite-wal')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText(/just now|^\d+m$|^\d+h$|^\d+d$/)).toBeTruthy();
  });

  it('renders the closed-not-merged variant', () => {
    const pr = makePr({
      mergedAt: undefined,
      closedAt: new Date().toISOString(),
      headRef: 'wip-feature',
    });
    render(<MergedCard pr={pr} />);
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText('wip-feature')).toBeTruthy();
    expect(screen.queryByText('Merged')).toBeNull();
  });

  it('uses a purple left rail for merged', () => {
    const pr = makePr({ mergedAt: new Date().toISOString() });
    const { container } = render(<MergedCard pr={pr} />);
    const card = container.querySelector('[data-merged-card]');
    expect(card?.getAttribute('data-variant')).toBe('merged');
  });

  it('uses a neutral left rail for closed', () => {
    const pr = makePr({ mergedAt: undefined, closedAt: new Date().toISOString() });
    const { container } = render(<MergedCard pr={pr} />);
    const card = container.querySelector('[data-merged-card]');
    expect(card?.getAttribute('data-variant')).toBe('closed');
  });

  it('clamps a future-timestamp (clock skew) to just now', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const pr = makePr({ mergedAt: future });
    render(<MergedCard pr={pr} />);
    expect(screen.getByText('Merged just now')).toBeTruthy();
  });
});
