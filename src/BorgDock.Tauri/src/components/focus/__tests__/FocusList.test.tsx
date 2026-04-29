import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { FocusList } from '../FocusList';
import { makePr, resetSeq } from './helpers';

// Mock heavy child components
vi.mock('@/components/pr/PrCardContainer', () => ({
  PrCardContainer: ({
    prWithChecks,
    isFocused,
    focusMode,
  }: {
    prWithChecks: PullRequestWithChecks;
    isFocused: boolean;
    focusMode: boolean;
  }) => (
    <div
      data-testid={`pr-card-${prWithChecks.pullRequest.number}`}
      data-focused={isFocused}
      data-focus-mode={focusMode}
    >
      {prWithChecks.pullRequest.title}
    </div>
  ),
}));

vi.mock('../FocusEmptyState', () => ({
  FocusEmptyState: () => <div data-testid="focus-empty-state">Empty</div>,
}));

vi.mock('@/components/onboarding', () => ({
  FeatureBadge: ({ badgeId }: { badgeId: string }) => <span data-testid={`badge-${badgeId}`} />,
  FirstRunOverlay: ({
    message,
    onDismiss,
    onCtaClick,
  }: {
    message: string;
    ctaLabel: string;
    onDismiss: () => void;
    onCtaClick: () => void;
  }) => (
    <div data-testid="first-run-overlay">
      <span>{message}</span>
      <button onClick={onCtaClick}>CTA</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
  InlineHint: ({ text }: { text: string }) => <div data-testid="inline-hint">{text}</div>,
}));

// Mock the onboarding-store to prevent dynamic Tauri imports from causing unhandled rejections.
// The real store's persist() does import('@tauri-apps/plugin-store') which can't be intercepted by vi.mock.
vi.mock('@/stores/onboarding-store', async () => {
  const { create } = await import('zustand');
  const store = create<{
    hasSeenFocusOverlay: boolean;
    dismissedBadges: Set<string>;
    dismissedHints: Set<string>;
    markFocusOverlaySeen: () => void;
    dismissBadge: (id: string) => void;
    dismissHint: (id: string) => void;
    resetAll: () => void;
    restoreOnboardingState: () => Promise<void>;
  }>()((set) => ({
    hasSeenFocusOverlay: false,
    dismissedBadges: new Set<string>(),
    dismissedHints: new Set<string>(),
    markFocusOverlaySeen: () => set({ hasSeenFocusOverlay: true }),
    dismissBadge: (id: string) =>
      set((s) => ({ dismissedBadges: new Set([...s.dismissedBadges, id]) })),
    dismissHint: (id: string) =>
      set((s) => ({ dismissedHints: new Set([...s.dismissedHints, id]) })),
    resetAll: () =>
      set({ hasSeenFocusOverlay: false, dismissedBadges: new Set(), dismissedHints: new Set() }),
    restoreOnboardingState: async () => {},
  }));
  return { useOnboardingStore: store };
});

afterEach(cleanup);

describe('FocusList', () => {
  beforeEach(() => {
    resetSeq();
    // Reset all stores to defaults
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      username: 'testuser',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
      reviewRequestTimestamps: {},
    });
    useUiStore.setState({ selectedPrNumber: null });
    useQuickReviewStore.getState().endSession();
    useOnboardingStore.setState({
      hasSeenFocusOverlay: true,
      dismissedBadges: new Set(),
      dismissedHints: new Set(),
    });
  });

  it('renders empty state when there are no focus PRs', () => {
    render(<FocusList />);
    expect(screen.getByTestId('focus-empty-state')).toBeDefined();
  });

  it('renders PR cards for focus PRs', () => {
    const pr1 = makePr({ title: 'Fix login', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'Add feature', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    expect(screen.getByText('Fix login')).toBeDefined();
    expect(screen.getByText('Add feature')).toBeDefined();
  });

  it('passes focusMode prop to PrCardContainer', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    const card = screen.getByTestId(`pr-card-${pr.pullRequest.number}`);
    expect(card.getAttribute('data-focus-mode')).toBe('true');
  });

  it('highlights the selected PR', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useUiStore.setState({ selectedPrNumber: pr.pullRequest.number });
    render(<FocusList />);
    const card = screen.getByTestId(`pr-card-${pr.pullRequest.number}`);
    expect(card.getAttribute('data-focused')).toBe('true');
  });

  it('does not highlight PRs that are not selected', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useUiStore.setState({ selectedPrNumber: 999 });
    render(<FocusList />);
    const card = screen.getByTestId(`pr-card-${pr.pullRequest.number}`);
    expect(card.getAttribute('data-focused')).toBe('false');
  });

  it('shows Quick Review button when there are PRs needing review', () => {
    const pr = makePr({
      authorLogin: 'other',
      requestedReviewers: ['testuser'],
    });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByText(/Start Quick Review/)).toBeDefined();
  });

  it('shows correct count in Quick Review button', () => {
    const pr1 = makePr({ authorLogin: 'other', requestedReviewers: ['testuser'] });
    const pr2 = makePr({ authorLogin: 'other', requestedReviewers: ['testuser'] });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    expect(screen.getByText(/Start Quick Review \(2 PRs\)/)).toBeDefined();
  });

  it('shows singular PR count in Quick Review button', () => {
    const pr = makePr({ authorLogin: 'other', requestedReviewers: ['testuser'] });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByText(/Start Quick Review \(1 PR\)/)).toBeDefined();
  });

  it('starts a quick review session when button is clicked', () => {
    const pr = makePr({ authorLogin: 'other', requestedReviewers: ['testuser'] });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    fireEvent.click(screen.getByText(/Start Quick Review/));
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
    expect(useQuickReviewStore.getState().queue.length).toBe(1);
  });

  it('shows FirstRunOverlay when not yet seen', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useOnboardingStore.setState({ hasSeenFocusOverlay: false });
    render(<FocusList />);
    expect(screen.getByTestId('first-run-overlay')).toBeDefined();
  });

  it('does not show FirstRunOverlay when already seen', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useOnboardingStore.setState({ hasSeenFocusOverlay: true });
    render(<FocusList />);
    expect(screen.queryByTestId('first-run-overlay')).toBeNull();
  });

  it('dismisses FirstRunOverlay when dismiss is clicked', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useOnboardingStore.setState({ hasSeenFocusOverlay: false });
    render(<FocusList />);
    fireEvent.click(screen.getByText('Dismiss'));
    expect(useOnboardingStore.getState().hasSeenFocusOverlay).toBe(true);
  });

  it('selects first PR when CTA is clicked in FirstRunOverlay', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useOnboardingStore.setState({ hasSeenFocusOverlay: false });
    render(<FocusList />);
    fireEvent.click(screen.getByText('CTA'));
    expect(useUiStore.getState().selectedPrNumber).toBe(pr.pullRequest.number);
  });

  it('shows inline hint about priority ranking', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByText('PRs are ranked by priority — most urgent first')).toBeDefined();
  });

  it('auto-dismisses focus-mode badge on mount', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(useOnboardingStore.getState().dismissedBadges.has('focus-mode')).toBe(true);
  });

  it('does not show Quick Review button when no PRs need review', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.queryByText(/Start Quick Review/)).toBeNull();
  });

  it('marks each focus PR row with [data-focus-item]', () => {
    const pr1 = makePr({ title: 'A', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'B', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr3 = makePr({ title: 'C', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2, pr3] });
    const { container } = render(<FocusList />);
    const rows = container.querySelectorAll('[data-focus-item]');
    const focusPrs = usePrStore.getState().focusPrs();
    expect(rows.length).toBe(focusPrs.length);
    expect(rows.length).toBe(3);
  });
});
