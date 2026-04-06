import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { QuickReviewOverlay } from '../QuickReviewOverlay';
import { makePr, resetSeq } from './helpers';

// Mock child components to isolate overlay logic
vi.mock('../QuickReviewCard', () => ({
  QuickReviewCard: ({ pr }: { pr: unknown }) => (
    <div data-testid="quick-review-card">card-{(pr as { pullRequest: { number: number } }).pullRequest.number}</div>
  ),
}));

vi.mock('../QuickReviewSummary', () => ({
  QuickReviewSummary: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="quick-review-summary">
      <button onClick={onClose}>Done</button>
    </div>
  ),
}));

vi.mock('@/components/onboarding', () => ({
  InlineHint: ({ text }: { text: string }) => <div data-testid="inline-hint">{text}</div>,
}));

vi.mock('@/services/github/mutations', () => ({
  submitReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn().mockReturnValue({ put: vi.fn(), post: vi.fn() }),
}));

afterEach(cleanup);

describe('QuickReviewOverlay', () => {
  beforeEach(() => {
    resetSeq();
    useQuickReviewStore.getState().endSession();
  });

  it('renders nothing when state is idle', () => {
    const { container } = render(<QuickReviewOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay when state is reviewing', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.getByText('Quick Review')).toBeDefined();
  });

  it('shows current index and total count', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    useQuickReviewStore.getState().startSession([pr1, pr2]);
    render(<QuickReviewOverlay />);
    expect(screen.getByText('1 / 2')).toBeDefined();
  });

  it('shows remaining count', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    const pr3 = makePr();
    useQuickReviewStore.getState().startSession([pr1, pr2, pr3]);
    render(<QuickReviewOverlay />);
    expect(screen.getByText('(2 remaining)')).toBeDefined();
  });

  it('renders the QuickReviewCard for the current PR', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.getByTestId('quick-review-card')).toBeDefined();
  });

  it('shows action buttons (Skip, Comment, Request Changes, Approve)', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.getByText(/Skip/)).toBeDefined();
    expect(screen.getByText(/Comment \(C\)/)).toBeDefined();
    expect(screen.getByText(/Request Changes \(X\)/)).toBeDefined();
    expect(screen.getByText(/Approve \(A\)/)).toBeDefined();
  });

  it('does not show Back button on first PR', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.queryByText(/Back/)).toBeNull();
  });

  it('shows Back button after advancing', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    useQuickReviewStore.getState().startSession([pr1, pr2]);
    act(() => { useQuickReviewStore.getState().advance('skipped'); });
    render(<QuickReviewOverlay />);
    expect(screen.getByText(/Back/)).toBeDefined();
  });

  it('clicking Skip advances to the next PR', () => {
    const pr1 = makePr();
    const pr2 = makePr();
    useQuickReviewStore.getState().startSession([pr1, pr2]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Skip/));
    expect(useQuickReviewStore.getState().currentIndex).toBe(1);
  });

  it('clicking Approve calls submitReview and advances', async () => {
    const { submitReview } = await import('@/services/github/mutations');
    const pr1 = makePr();
    const pr2 = makePr();
    useQuickReviewStore.getState().startSession([pr1, pr2]);
    render(<QuickReviewOverlay />);
    await act(async () => {
      fireEvent.click(screen.getByText(/Approve \(A\)/));
    });
    expect(submitReview).toHaveBeenCalled();
  });

  it('shows comment textarea when Comment button is clicked', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Comment \(C\)/));
    expect(screen.getByPlaceholderText('Write a comment...')).toBeDefined();
  });

  it('shows request changes textarea when Request Changes is clicked', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Request Changes \(X\)/));
    expect(screen.getByPlaceholderText('Describe the changes needed...')).toBeDefined();
  });

  it('hides action bar when comment mode is active', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Comment \(C\)/));
    expect(screen.queryByText(/Approve \(A\)/)).toBeNull();
  });

  it('Cancel button in comment mode restores action bar', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Comment \(C\)/));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText(/Approve \(A\)/)).toBeDefined();
  });

  it('Submit Comment button is disabled when textarea is empty', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Comment \(C\)/));
    const submitBtn = screen.getByText(/Submit Comment/);
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it('Submit Comment button is enabled when textarea has content', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Comment \(C\)/));
    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: { value: 'Looks good' },
    });
    const submitBtn = screen.getByText(/Submit Comment/);
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
  });

  it('shows Submit Request Changes when in changes mode', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText(/Request Changes \(X\)/));
    expect(screen.getByText(/Submit Request Changes/)).toBeDefined();
  });

  it('renders error banner when store has an error', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    act(() => { useQuickReviewStore.getState().setError('Network error'); });
    render(<QuickReviewOverlay />);
    expect(screen.getByText('Network error')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('clicking Retry clears the error', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    act(() => { useQuickReviewStore.getState().setError('Timeout'); });
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText('Retry'));
    expect(useQuickReviewStore.getState().error).toBeNull();
  });

  it('clicking close button ends session', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    fireEvent.click(screen.getByText('\u2715'));
    expect(useQuickReviewStore.getState().state).toBe('idle');
  });

  it('clicking backdrop ends session', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    const { container } = render(<QuickReviewOverlay />);
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(useQuickReviewStore.getState().state).toBe('idle');
  });

  it('renders summary when state is complete', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    act(() => { useQuickReviewStore.getState().advance('approved'); });
    expect(useQuickReviewStore.getState().state).toBe('complete');
    render(<QuickReviewOverlay />);
    expect(screen.getByTestId('quick-review-summary')).toBeDefined();
  });

  it('shows keyboard shortcuts hint during review', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.getByText(/A approve/)).toBeDefined();
  });

  it('renders InlineHint during reviewing state', () => {
    const pr = makePr();
    useQuickReviewStore.getState().startSession([pr]);
    render(<QuickReviewOverlay />);
    expect(screen.getByTestId('inline-hint')).toBeDefined();
  });
});
