import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewDecision } from '@/stores/quick-review-store';
import { QuickReviewSummary } from '../QuickReviewSummary';
import { makePr, resetSeq } from './helpers';

afterEach(cleanup);

describe('QuickReviewSummary', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetSeq();
    onClose.mockClear();
  });

  it('renders the "Review Complete" heading', () => {
    render(<QuickReviewSummary queue={[]} decisions={new Map()} onClose={onClose} />);
    expect(screen.getByText('Review Complete')).toBeDefined();
  });

  it('marks the outer container with data-quick-review-summary', () => {
    const { container } = render(
      <QuickReviewSummary queue={[]} decisions={new Map()} onClose={onClose} />,
    );
    expect(container.querySelector('[data-quick-review-summary]')).not.toBeNull();
  });

  it('shows correct plural count for multiple PRs', () => {
    const queue = [makePr(), makePr(), makePr()];
    render(<QuickReviewSummary queue={queue} decisions={new Map()} onClose={onClose} />);
    expect(screen.getByText('3 PRs reviewed')).toBeDefined();
  });

  it('shows singular count for 1 PR', () => {
    const queue = [makePr()];
    render(<QuickReviewSummary queue={queue} decisions={new Map()} onClose={onClose} />);
    expect(screen.getByText('1 PR reviewed')).toBeDefined();
  });

  it('renders approved count when present', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    const decisions = new Map<number, ReviewDecision>([
      [pr1.pullRequest.number, 'approved'],
      [pr2.pullRequest.number, 'approved'],
    ]);
    render(<QuickReviewSummary queue={[pr1, pr2]} decisions={decisions} onClose={onClose} />);
    expect(screen.getByText('2')).toBeDefined();
    // "Approved" appears in the stats and in the PR list rows
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
  });

  it('renders commented count when present', () => {
    const pr1 = makePr();
    const decisions = new Map<number, ReviewDecision>([[pr1.pullRequest.number, 'commented']]);
    render(<QuickReviewSummary queue={[pr1]} decisions={decisions} onClose={onClose} />);
    // "Commented" appears in the stats section and the PR list
    expect(screen.getAllByText('Commented').length).toBeGreaterThanOrEqual(1);
  });

  it('renders skipped count when present', () => {
    const pr1 = makePr();
    const decisions = new Map<number, ReviewDecision>([[pr1.pullRequest.number, 'skipped']]);
    render(<QuickReviewSummary queue={[pr1]} decisions={decisions} onClose={onClose} />);
    // "Skipped" appears in the stats section and the PR list
    expect(screen.getAllByText('Skipped').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render zero-count decision categories in stats', () => {
    const pr1 = makePr();
    const decisions = new Map<number, ReviewDecision>([[pr1.pullRequest.number, 'approved']]);
    render(<QuickReviewSummary queue={[pr1]} decisions={decisions} onClose={onClose} />);
    expect(screen.queryByText('Commented')).toBeNull();
    expect(screen.queryByText('Skipped')).toBeNull();
  });

  it('renders mixed decisions correctly', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    const pr3 = makePr();
    const decisions = new Map<number, ReviewDecision>([
      [pr1.pullRequest.number, 'approved'],
      [pr2.pullRequest.number, 'commented'],
      [pr3.pullRequest.number, 'skipped'],
    ]);
    render(<QuickReviewSummary queue={[pr1, pr2, pr3]} decisions={decisions} onClose={onClose} />);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Commented').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Skipped').length).toBeGreaterThanOrEqual(1);
  });

  it('lists each PR with its number and title', () => {
    const pr1 = makePr({ number: 100, title: 'Fix auth flow' });
    const pr2 = makePr({ number: 200, title: 'Add tests' });
    const decisions = new Map<number, ReviewDecision>([
      [100, 'approved'],
      [200, 'skipped'],
    ]);
    render(<QuickReviewSummary queue={[pr1, pr2]} decisions={decisions} onClose={onClose} />);
    expect(screen.getByText(/Fix auth flow/)).toBeDefined();
    expect(screen.getByText(/Add tests/)).toBeDefined();
  });

  it('shows decision label for each PR in the list', () => {
    const pr1 = makePr({ number: 100, title: 'Fix auth flow' });
    const decisions = new Map<number, ReviewDecision>([[100, 'approved']]);
    render(<QuickReviewSummary queue={[pr1]} decisions={decisions} onClose={onClose} />);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
  });

  it('handles PR with no decision (not yet reviewed)', () => {
    const pr1 = makePr({ number: 100, title: 'WIP feature' });
    render(<QuickReviewSummary queue={[pr1]} decisions={new Map()} onClose={onClose} />);
    expect(screen.getByText(/WIP feature/)).toBeDefined();
  });

  it('calls onClose when Done button is clicked', () => {
    render(<QuickReviewSummary queue={[]} decisions={new Map()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
