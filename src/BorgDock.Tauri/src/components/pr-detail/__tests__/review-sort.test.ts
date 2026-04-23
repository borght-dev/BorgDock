import { describe, expect, it } from 'vitest';
import { severityOrder, sortReviews } from '../ReviewsTab';

const makeReview = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  user: 'alice',
  state: 'COMMENTED',
  body: '',
  submittedAt: '2026-01-15T10:00:00Z',
  ...overrides,
});

describe('sortReviews', () => {
  const reviews = [
    makeReview({ id: 1, submittedAt: '2026-01-15T10:00:00Z', state: 'COMMENTED' }),
    makeReview({ id: 2, submittedAt: '2026-01-16T10:00:00Z', state: 'CHANGES_REQUESTED' }),
    makeReview({ id: 3, submittedAt: '2026-01-14T10:00:00Z', state: 'APPROVED' }),
  ];

  it('sorts newest first by default', () => {
    const sorted = sortReviews(reviews, 'newest');
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('sorts oldest first', () => {
    const sorted = sortReviews(reviews, 'oldest');
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it('sorts by severity (changes_requested > commented > approved)', () => {
    const sorted = sortReviews(reviews, 'severity');
    expect(sorted.map((r) => r.state)).toEqual(['CHANGES_REQUESTED', 'COMMENTED', 'APPROVED']);
  });

  it('does not mutate the original array', () => {
    const copy = [...reviews];
    sortReviews(reviews, 'newest');
    expect(reviews).toEqual(copy);
  });

  it('handles empty array', () => {
    expect(sortReviews([], 'newest')).toEqual([]);
  });
});

describe('severityOrder', () => {
  it('ranks CHANGES_REQUESTED highest', () => {
    expect(severityOrder('CHANGES_REQUESTED')).toBeLessThan(severityOrder('COMMENTED'));
    expect(severityOrder('CHANGES_REQUESTED')).toBeLessThan(severityOrder('APPROVED'));
  });
});
