import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock all tab sub-components to isolate PrDetailPanel logic
vi.mock('../OverviewTab', () => ({
  OverviewTab: ({ pr }: { pr: PullRequestWithChecks }) => (
    <div data-testid="overview-tab">Overview for #{pr.pullRequest.number}</div>
  ),
}));
vi.mock('../CommitsTab', () => ({
  CommitsTab: () => <div data-testid="commits-tab">Commits</div>,
}));
vi.mock('../FilesTab', () => ({
  FilesTab: () => <div data-testid="files-tab">Files</div>,
}));
vi.mock('../ChecksTab', () => ({
  ChecksTab: () => <div data-testid="checks-tab">Checks</div>,
}));
vi.mock('../ReviewsTab', () => ({
  ReviewsTab: () => <div data-testid="reviews-tab">Reviews</div>,
}));
vi.mock('../CommentsTab', () => ({
  CommentsTab: () => <div data-testid="comments-tab">Comments</div>,
}));

// Import after mocks
import { PrDetailPanel } from '../PrDetailPanel';

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Add feature X',
      headRef: 'feature-x',
      baseRef: 'main',
      authorLogin: 'dev',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/owner/repo/pull/42',
      body: 'Description',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 3,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    ...overrides,
  };
}

describe('PrDetailPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useUiStore.setState({ selectedPrNumber: 42 });
    vi.clearAllMocks();
  });

  it('renders the PR title', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(screen.getByText('Add feature X')).toBeTruthy();
  });

  it('renders the PR number', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(screen.getByText('#42')).toBeTruthy();
  });

  it('renders all tab buttons', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Commits' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Checks' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Reviews' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeTruthy();
  });

  it('shows Overview tab content by default', () => {
    render(<PrDetailPanel pr={makePr()} />);
    const overviewTab = screen.getByTestId('overview-tab');
    expect(overviewTab.closest('.hidden')).toBeNull();
  });

  it('does not mount inactive tabs until first activation', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(screen.queryByTestId('commits-tab')).toBeNull();
  });

  it('switches to Commits tab on click', () => {
    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Commits' }));
    const commitsTab = screen.getByTestId('commits-tab');
    expect(commitsTab.closest('.hidden')).toBeNull();
    const overviewTab = screen.getByTestId('overview-tab');
    expect(overviewTab.closest('.hidden')).toBeTruthy();
  });

  it('switches to Files tab on click', () => {
    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const filesTab = screen.getByTestId('files-tab');
    expect(filesTab.closest('.hidden')).toBeNull();
  });

  it('switches to Checks tab on click', () => {
    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Checks' }));
    const checksTab = screen.getByTestId('checks-tab');
    expect(checksTab.closest('.hidden')).toBeNull();
  });

  it('switches to Reviews tab on click', () => {
    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Reviews' }));
    const reviewsTab = screen.getByTestId('reviews-tab');
    expect(reviewsTab.closest('.hidden')).toBeNull();
  });

  it('close button calls selectPr(null)', () => {
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });
    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(selectPrSpy).toHaveBeenCalledWith(null);
  });

  it('pop-out button invokes open_pr_detail_window and deselects PR', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });

    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Pop out'));

    expect(mockInvoke).toHaveBeenCalledWith('open_pr_detail_window', {
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    await Promise.resolve();
    expect(selectPrSpy).toHaveBeenCalledWith(null);
  });

  it('keeps the inline panel open when pop-out fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockRejectedValue(new Error('window open failed'));
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });

    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Pop out'));

    // Wait for the rejected promise to settle, then assert no navigation happened.
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_pr_detail_window', {
        owner: 'owner',
        repo: 'repo',
        number: 42,
      });
    });
    // Flush any pending promise chains from the rejected invoke.
    await Promise.resolve();
    await Promise.resolve();
    expect(selectPrSpy).not.toHaveBeenCalled();
  });

  it('marks the active tab with aria-selected', () => {
    render(<PrDetailPanel pr={makePr()} />);
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab.getAttribute('aria-selected')).toBe('true');
    const commitsTab = screen.getByRole('tab', { name: 'Commits' });
    expect(commitsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('mounts tabs lazily and keeps them cached after activation', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(screen.getByTestId('overview-tab')).toBeTruthy();
    expect(screen.queryByTestId('commits-tab')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Commits' }));
    expect(screen.getByTestId('commits-tab')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.getByTestId('commits-tab')).toBeTruthy();
  });
});
