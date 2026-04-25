import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeReviewComment } from '@/types';
import { ClaudeReviewPanel } from '../ClaudeReviewPanel';

vi.mock('../ReviewCommentCard', () => ({
  ReviewCommentCard: ({ comment }: { comment: ClaudeReviewComment }) => (
    <div data-testid="review-comment-card">{comment.body}</div>
  ),
}));

const makeComment = (overrides: Partial<ClaudeReviewComment> = {}): ClaudeReviewComment => ({
  id: '1',
  author: 'claude',
  body: 'Test comment',
  severity: 'suggestion',
  createdAt: '2024-01-01T00:00:00Z',
  htmlUrl: 'https://github.com/pr/1',
  ...overrides,
});

describe('ClaudeReviewPanel', () => {
  it('shows empty state when no comments', () => {
    render(<ClaudeReviewPanel comments={[]} />);
    expect(screen.getByText('No Claude review comments')).toBeDefined();
  });

  it('renders grouped comments by severity', () => {
    const comments = [
      makeComment({ id: '1', severity: 'critical', body: 'Critical issue' }),
      makeComment({ id: '2', severity: 'suggestion', body: 'Consider this' }),
      makeComment({ id: '3', severity: 'praise', body: 'Nice work' }),
    ];
    render(<ClaudeReviewPanel comments={comments} />);
    expect(screen.getByText('Critical')).toBeDefined();
    expect(screen.getByText('Suggestion')).toBeDefined();
    expect(screen.getByText('Praise')).toBeDefined();
  });

  it('shows correct count badges for each group', () => {
    const comments = [
      makeComment({ id: '1', severity: 'critical', body: 'Issue 1' }),
      makeComment({ id: '2', severity: 'critical', body: 'Issue 2' }),
      makeComment({ id: '3', severity: 'suggestion', body: 'Suggestion 1' }),
    ];
    render(<ClaudeReviewPanel comments={comments} />);
    // Critical group has 2 items
    expect(screen.getByText('2')).toBeDefined();
    // Suggestion group has 1 item
    expect(screen.getByText('1')).toBeDefined();
  });

  it('renders comments expanded by default', () => {
    const comments = [makeComment({ id: '1', severity: 'critical', body: 'Critical issue' })];
    render(<ClaudeReviewPanel comments={comments} />);
    expect(screen.getByTestId('review-comment-card')).toBeDefined();
    expect(screen.getByText('Critical issue')).toBeDefined();
  });

  it('collapses a group when clicking the header', () => {
    const comments = [makeComment({ id: '1', severity: 'critical', body: 'Critical issue' })];
    render(<ClaudeReviewPanel comments={comments} />);

    // Verify comment is visible
    expect(screen.getByText('Critical issue')).toBeDefined();

    // Click the group header to collapse
    fireEvent.click(screen.getByText('Critical'));
    expect(screen.queryByText('Critical issue')).toBeNull();

    // Click again to expand
    fireEvent.click(screen.getByText('Critical'));
    expect(screen.getByText('Critical issue')).toBeDefined();
  });

  it('does not render severity groups with no comments', () => {
    const comments = [makeComment({ id: '1', severity: 'critical', body: 'Issue' })];
    render(<ClaudeReviewPanel comments={comments} />);
    expect(screen.queryByText('Suggestion')).toBeNull();
    expect(screen.queryByText('Praise')).toBeNull();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('renders "Other" group for unknown severity', () => {
    const comments = [makeComment({ id: '1', severity: 'unknown', body: 'Unknown item' })];
    render(<ClaudeReviewPanel comments={comments} />);
    expect(screen.getByText('Other')).toBeDefined();
    expect(screen.getByText('Unknown item')).toBeDefined();
  });

  it('preserves group order: critical, suggestion, praise, unknown', () => {
    const comments = [
      makeComment({ id: '1', severity: 'praise', body: 'Praise' }),
      makeComment({ id: '2', severity: 'unknown', body: 'Other' }),
      makeComment({ id: '3', severity: 'critical', body: 'Critical' }),
      makeComment({ id: '4', severity: 'suggestion', body: 'Suggestion' }),
    ];
    const { container } = render(<ClaudeReviewPanel comments={comments} />);
    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent);
    const critIdx = labels.findIndex((l) => l?.includes('Critical'));
    const sugIdx = labels.findIndex((l) => l?.includes('Suggestion'));
    const praiseIdx = labels.findIndex((l) => l?.includes('Praise'));
    const otherIdx = labels.findIndex((l) => l?.includes('Other'));
    expect(critIdx).toBeLessThan(sugIdx);
    expect(sugIdx).toBeLessThan(praiseIdx);
    expect(praiseIdx).toBeLessThan(otherIdx);
  });

  it('renders multiple comments within same group', () => {
    const comments = [
      makeComment({ id: '1', severity: 'suggestion', body: 'Suggestion 1' }),
      makeComment({ id: '2', severity: 'suggestion', body: 'Suggestion 2' }),
      makeComment({ id: '3', severity: 'suggestion', body: 'Suggestion 3' }),
    ];
    render(<ClaudeReviewPanel comments={comments} />);
    const cards = screen.getAllByTestId('review-comment-card');
    expect(cards).toHaveLength(3);
  });

  it('renders each group with data-review-group', () => {
    const comments = [
      makeComment({ id: '1', severity: 'critical', body: 'Critical issue' }),
      makeComment({ id: '2', severity: 'suggestion', body: 'Consider this' }),
      makeComment({ id: '3', severity: 'praise', body: 'Nice work' }),
    ];
    const { container } = render(<ClaudeReviewPanel comments={comments} />);
    expect(container.querySelector('[data-review-group="critical"]')).toBeInTheDocument();
    expect(container.querySelector('[data-review-group="suggestion"]')).toBeInTheDocument();
    expect(container.querySelector('[data-review-group="praise"]')).toBeInTheDocument();
  });

  it('renders count as a Pill primitive (no --color-filter-chip-bg reference, no nested button)', () => {
    const comments = [
      makeComment({ id: '1', severity: 'critical', body: 'Issue 1' }),
      makeComment({ id: '2', severity: 'critical', body: 'Issue 2' }),
    ];
    const { container } = render(<ClaudeReviewPanel comments={comments} />);
    expect(container.querySelector('.bd-pill')).toBeInTheDocument();
    // Ensure the old token reference is gone:
    expect(container.innerHTML).not.toMatch(/var\(--color-filter-chip-bg\)/);
    // Pill is a span (non-interactive), avoiding the <button> nested in <button> hydration warning.
    const reviewGroupBtn = container.querySelector('[data-review-group="critical"]');
    expect(reviewGroupBtn?.querySelector('button')).toBeNull();
  });
});
