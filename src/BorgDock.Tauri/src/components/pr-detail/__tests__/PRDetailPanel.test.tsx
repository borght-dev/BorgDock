import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import type { CheckRun } from '@/types/check-run';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockOpenPrDetail = vi.fn();
vi.mock('@/services/windows', () => ({
  openPrDetail: (...args: unknown[]) => mockOpenPrDetail(...args),
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

// Mock ActionBar, ActivityStrip, CheckoutPanel so PRDetailPanel tests stay focused
vi.mock('../ActionBar', () => ({
  ActionBar: () => <div data-action-bar />,
}));
vi.mock('../ActivityStrip', () => ({
  ActivityStrip: () => <div data-activity-strip />,
}));
vi.mock('../CheckoutPanel', () => ({
  CheckoutPanel: () => <div data-testid="checkout-panel" />,
}));
vi.mock('@/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

// Mock usePrActions — return a stable no-op actions object
vi.mock('../usePrActions', () => ({
  usePrActions: () => ({
    onMerge: vi.fn(),
    onBypassConfirm: vi.fn(),
    onBypassExecute: vi.fn(),
    onCloseConfirm: vi.fn(),
    onCloseExecute: vi.fn(),
    onToggleDraft: vi.fn(),
    onResolveConflicts: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onCopyBranch: vi.fn(),
    onCheckoutToggle: vi.fn(),
    actionStatus: '',
    isReady: true,
    checkoutOpen: false,
    setCheckoutOpen: vi.fn(),
    confirmClose: false,
    setConfirmClose: vi.fn(),
    confirmBypass: false,
    setConfirmBypass: vi.fn(),
    repoPath: '',
    worktreeSubfolder: '.worktrees',
    favoritePaths: undefined,
    favoritesOnlyDefault: false,
    windowsTerminalProfile: undefined,
  }),
}));

// Import after mocks
import { PrDetailPanel } from '../PRDetailPanel';

const stubCheck: CheckRun = {
  id: 1,
  name: 'ci',
  status: 'completed',
  conclusion: 'success',
  htmlUrl: '',
  checkSuiteId: 1,
};

interface FakePrOptions {
  pendingCheckNames?: string[];
  passedCount?: number;
  failedCheckNames?: string[];
  skippedCount?: number;
}

function makePr(overrides: Partial<PullRequestWithChecks> & FakePrOptions = {}): PullRequestWithChecks {
  const {
    pendingCheckNames = [],
    passedCount = 0,
    failedCheckNames = [],
    skippedCount = 0,
    ...rest
  } = overrides;

  // Build a checks array big enough to match the totals.
  // passedCount + pendingCheckNames.length + failedCheckNames.length checks (all stubs).
  const totalRaw = passedCount + pendingCheckNames.length + failedCheckNames.length;
  const checks: CheckRun[] = Array.from({ length: totalRaw }, (_, i) => {
    let name: string;
    if (i < passedCount) {
      name = `passed-${i}`;
    } else if (i < passedCount + pendingCheckNames.length) {
      name = pendingCheckNames[i - passedCount] ?? `pending-${i}`;
    } else {
      name = failedCheckNames[i - passedCount - pendingCheckNames.length] ?? `failed-${i}`;
    }
    return { ...stubCheck, id: i + 1, name };
  });

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
      ...rest.pullRequest,
    },
    overallStatus: 'green',
    ...rest,
    checks: rest.checks ?? checks,
    failedCheckNames,
    pendingCheckNames,
    passedCount,
    skippedCount,
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

  it('pop-out button dispatches openPrDetail and deselects PR', async () => {
    mockOpenPrDetail.mockResolvedValue(undefined);
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });

    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Pop out'));

    expect(mockOpenPrDetail).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    await Promise.resolve();
    expect(selectPrSpy).toHaveBeenCalledWith(null);
  });

  it('keeps the inline panel open when pop-out fails', async () => {
    mockOpenPrDetail.mockRejectedValue(new Error('window open failed'));
    const selectPrSpy = vi.fn();
    useUiStore.setState({ selectPr: selectPrSpy });

    render(<PrDetailPanel pr={makePr()} />);
    fireEvent.click(screen.getByLabelText('Pop out'));

    // Wait for the rejected promise to settle, then assert no navigation happened.
    await waitFor(() => {
      expect(mockOpenPrDetail).toHaveBeenCalledWith({
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

  describe('terminal state pills', () => {
    it('renders a Merged pill when mergedAt is set', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' } })} />);
      const pill = screen.getByText('Merged');
      expect(pill.classList.contains('bd-pill--merged')).toBe(true);
    });

    it('renders a Closed pill when state is closed and not merged', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', closedAt: '2026-05-06T12:00:00Z' } })} />);
      const pill = screen.getByText('Closed');
      expect(pill.classList.contains('bd-pill--neutral')).toBe(true);
    });

    it('suppresses the Mergeable pill in terminal state', () => {
      render(<PrDetailPanel pr={makePr({ pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z', mergeable: true } })} />);
      expect(screen.queryByText('Mergeable')).toBeNull();
    });

    it('suppresses the passed-count pill in terminal state', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
        checks: [{ id: 1, name: 'ci', status: 'completed', conclusion: 'success', htmlUrl: '', checkSuiteId: 1 }],
        passedCount: 1,
      });
      render(<PrDetailPanel pr={merged} />);
      expect(screen.queryByText(/passed/i)).toBeNull();
    });

    it('shows Mergeable pill when state is open', () => {
      render(<PrDetailPanel pr={makePr()} />);
      expect(screen.getByText('Mergeable')).toBeTruthy();
    });
  });

  it('shows a yellow "N running" pill in the header when checks are pending', () => {
    render(<PrDetailPanel pr={makePr({ pendingCheckNames: ['shard-0', 'shard-1'] })} />);
    expect(screen.getByText(/2 running/i)).toBeInTheDocument();
  });

  it('renders an ActionBar when the PR is open', () => {
    render(<PrDetailPanel pr={makePr()} />);
    expect(document.querySelector('[data-action-bar]')).not.toBeNull();
  });

  it('renders an ActivityStrip when there are checks', () => {
    render(<PrDetailPanel pr={makePr({ pendingCheckNames: ['x'], passedCount: 0 })} />);
    expect(document.querySelector('[data-activity-strip]')).not.toBeNull();
  });

  it('Checks tab badge uses passed/total format', () => {
    render(
      <PrDetailPanel
        pr={makePr({
          passedCount: 13,
          pendingCheckNames: ['a', 'b'],
        })}
      />,
    );
    const badge = screen.getByRole('tab', { name: /checks/i }).querySelector('.bd-tab__count');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('13/15');
  });
});
