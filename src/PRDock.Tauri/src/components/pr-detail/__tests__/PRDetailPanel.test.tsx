import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { useUiStore } from '@/stores/ui-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock all tab sub-components to isolate PRDetailPanel logic
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
import { PRDetailPanel } from '../PRDetailPanel';

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

describe('PRDetailPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useUiStore.setState({ selectedPrNumber: 42 });
    vi.clearAllMocks();
  });

  it('renders the PR title', () => {
    render(<PRDetailPanel pr={makePr()} />);
    expect(screen.getByText('Add feature X')).toBeTruthy();
  });

  it('renders the PR number', () => {
    render(<PRDetailPanel pr={makePr()} />);
    expect(screen.getByText('#42')).toBeTruthy();
  });

  it('renders all tab buttons', () => {
    render(<PRDetailPanel pr={makePr()} />);
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commits' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Files' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Checks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reviews' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comments' })).toBeTruthy();
  });

  it('shows Overview tab content by default', () => {
    render(<PRDetailPanel pr={makePr()} />);
    const overviewTab = screen.getByTestId('overview-tab');
    expect(overviewTab.closest('.hidden')).toBeNull();
  });

  it('hides non-active tab content', () => {
    render(<PRDetailPanel pr={makePr()} />);
    const commitsTab = screen.getByTestId('commits-tab');
    expect(commitsTab.closest('.hidden')).toBeTruthy();
  });

  it('switches to Commits tab on click', () => {
    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Commits' }));
    const commitsTab = screen.getByTestId('commits-tab');
    expect(commitsTab.closest('.hidden')).toBeNull();
    const overviewTab = screen.getByTestId('overview-tab');
    expect(overviewTab.closest('.hidden')).toBeTruthy();
  });

  it('switches to Files tab on click', () => {
    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    const filesTab = screen.getByTestId('files-tab');
    expect(filesTab.closest('.hidden')).toBeNull();
  });

  it('switches to Checks tab on click', () => {
    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));
    const checksTab = screen.getByTestId('checks-tab');
    expect(checksTab.closest('.hidden')).toBeNull();
  });

  it('switches to Reviews tab on click', () => {
    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reviews' }));
    const reviewsTab = screen.getByTestId('reviews-tab');
    expect(reviewsTab.closest('.hidden')).toBeNull();
  });

  it('close button calls selectPr(null)', () => {
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });
    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(selectPrSpy).toHaveBeenCalledWith(null);
  });

  it('pop-out button invokes open_pr_detail_window and deselects PR', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });

    render(<PRDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Pop out'));

    expect(mockInvoke).toHaveBeenCalledWith('open_pr_detail_window', {
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    expect(selectPrSpy).toHaveBeenCalledWith(null);
  });

  it('renders animated underline element', () => {
    const { container } = render(<PRDetailPanel pr={makePr()} />);
    const underline = container.querySelector('.bg-\\[var\\(--color-tab-active\\)\\]');
    expect(underline).toBeTruthy();
  });

  it('eagerly renders all tabs (not lazy-loaded)', () => {
    render(<PRDetailPanel pr={makePr()} />);
    // All tab test IDs should be present even if hidden
    expect(screen.getByTestId('overview-tab')).toBeTruthy();
    expect(screen.getByTestId('commits-tab')).toBeTruthy();
    expect(screen.getByTestId('files-tab')).toBeTruthy();
    expect(screen.getByTestId('checks-tab')).toBeTruthy();
    expect(screen.getByTestId('reviews-tab')).toBeTruthy();
    expect(screen.getByTestId('comments-tab')).toBeTruthy();
  });
});
