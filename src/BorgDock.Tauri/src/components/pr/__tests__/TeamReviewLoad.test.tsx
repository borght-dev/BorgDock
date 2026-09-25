import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewerLoad } from '@/services/team-review-load';
import { usePrStore } from '@/stores/pr-store';
import { ReviewerRow, useTeamReviewers } from '../TeamReviewLoad';

afterEach(cleanup);

function reviewer(overrides: Partial<ReviewerLoad> = {}): ReviewerLoad {
  return {
    login: 'alice',
    pendingReviewCount: 3,
    stalePrCount: 0,
    avgWaitHours: 5,
    ...overrides,
  };
}

describe('ReviewerRow', () => {
  it('shows the initials, login and pending count', () => {
    render(<ReviewerRow reviewer={reviewer()} onSelect={() => {}} />);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('names pending and stale reviews in the tooltip', () => {
    render(
      <ReviewerRow
        reviewer={reviewer({ pendingReviewCount: 1, stalePrCount: 2 })}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('title', 'alice: 1 pending review, 2 stale');
  });

  it('hands the reviewer to onSelect on click', () => {
    const onSelect = vi.fn();
    const r = reviewer();
    render(<ReviewerRow reviewer={r} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(r);
  });
});

describe('useTeamReviewers', () => {
  it('returns the store’s team review load', () => {
    const load = [reviewer(), reviewer({ login: 'bob' })];
    const before = usePrStore.getState().teamReviewLoad;
    usePrStore.setState({ teamReviewLoad: () => load });
    try {
      const { result } = renderHook(() => useTeamReviewers());
      expect(result.current.map((r) => r.login)).toEqual(['alice', 'bob']);
    } finally {
      usePrStore.setState({ teamReviewLoad: before });
    }
  });
});
