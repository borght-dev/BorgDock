import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useUiStore } from '@/stores/ui-store';
import { FocusList } from '../FocusList';
import { makePr, resetSeq } from './helpers';

// Spy on the pop-out invoke. The Open button and FirstRunOverlay CTA both
// pop out the detail window; the inline detail panel was removed in the
// main-window rewrite.
const mockOpenPrDetail = vi.fn();
vi.mock('@/services/windows', () => ({
  openPrDetail: (...args: unknown[]) => {
    mockOpenPrDetail(...args);
    return Promise.resolve();
  },
}));

// Mock heavy primitives
vi.mock('@/components/shared/primitives', async () => {
  const actual = await import('@/components/shared/primitives');
  return {
    ...actual,
    Ring: ({ value }: { value: number }) => (
      <div data-testid="ring" data-value={value} />
    ),
    Avatar: ({ initials }: { initials: string }) => (
      <span data-testid="avatar">{initials}</span>
    ),
  };
});

vi.mock('../FocusEmptyState', () => ({
  FocusEmptyState: () => <div data-testid="focus-empty-state">Empty</div>,
}));

vi.mock('../PriorityReasonLabel', () => ({
  PriorityReasonLabel: ({ factors }: { factors: { label: string }[] }) => (
    <span data-testid="priority-reason">{factors[0]?.label}</span>
  ),
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
    mockOpenPrDetail.mockClear();
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

  it('renders hero header with correct PR count', () => {
    const pr1 = makePr({ title: 'Fix login', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'Add feature', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    expect(screen.getByText(/2 pull requests need your attention/)).toBeDefined();
  });

  it('renders PR titles in focus rows', () => {
    const pr1 = makePr({ title: 'Fix login', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'Add feature', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    expect(screen.getByText('Fix login')).toBeDefined();
    expect(screen.getByText('Add feature')).toBeDefined();
  });

  it('renders rank numbers for each focus PR', () => {
    const pr1 = makePr({ title: 'A', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'B', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders Open button for each focus PR', () => {
    const pr1 = makePr({ title: 'A', authorLogin: 'testuser', reviewStatus: 'approved' });
    const pr2 = makePr({ title: 'B', authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr1, pr2] });
    render(<FocusList />);
    const openButtons = screen.getAllByText('Open');
    expect(openButtons.length).toBe(2);
  });

  it('Open button pops out the PR detail window with owner/repo/number', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    fireEvent.click(screen.getByText('Open'));
    expect(mockOpenPrDetail).toHaveBeenCalledWith({
      owner: pr.pullRequest.repoOwner,
      repo: pr.pullRequest.repoName,
      number: pr.pullRequest.number,
    });
  });

  it('shows hero CTA "Start Quick Review" when there are focus PRs', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByText('Start Quick Review')).toBeDefined();
  });

  it('starts a quick review session when hero CTA is clicked (needsMyReview items)', () => {
    const pr = makePr({ authorLogin: 'other', requestedReviewers: ['testuser'] });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    fireEvent.click(screen.getByText('Start Quick Review'));
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
    expect(useQuickReviewStore.getState().queue.length).toBe(1);
  });

  it('starts a quick review session from focusPrs when no needsMyReview items', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    fireEvent.click(screen.getByText('Start Quick Review'));
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
  });

  it('shows singular "pull request" in hero when count is 1', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByText(/1 pull request need your attention/)).toBeDefined();
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

  it('pops out PR detail when CTA is clicked in FirstRunOverlay', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    useOnboardingStore.setState({ hasSeenFocusOverlay: false });
    render(<FocusList />);
    fireEvent.click(screen.getByText('CTA'));
    expect(mockOpenPrDetail).toHaveBeenCalledWith({
      owner: pr.pullRequest.repoOwner,
      repo: pr.pullRequest.repoName,
      number: pr.pullRequest.number,
    });
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

  it('renders status label for each PR based on overallStatus', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    // Default overallStatus in makePr is 'green' → shows 'Passing'
    expect(screen.getByText('Passing')).toBeDefined();
  });

  it('renders Ring component for each focus PR', () => {
    const pr = makePr({ authorLogin: 'testuser', reviewStatus: 'approved' });
    usePrStore.setState({ pullRequests: [pr] });
    render(<FocusList />);
    expect(screen.getByTestId('ring')).toBeDefined();
  });
});
