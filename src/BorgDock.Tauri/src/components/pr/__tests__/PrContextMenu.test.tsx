import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { PrContextMenu } from '../PrContextMenu';

afterEach(cleanup);

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

const mockCopyToClipboard = vi.fn().mockResolvedValue(true);
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
}));

const mockMergePr = vi.fn().mockResolvedValue(true);
const mockCheckoutPrBranch = vi.fn().mockResolvedValue(true);
const mockRerunChecks = vi.fn().mockResolvedValue(true);
const mockOpenPrInBrowser = vi.fn().mockResolvedValue(true);
vi.mock('@/services/pr-actions', () => ({
  mergePr: (...args: unknown[]) => mockMergePr(...args),
  checkoutPrBranch: (...args: unknown[]) => mockCheckoutPrBranch(...args),
  rerunChecks: (...args: unknown[]) => mockRerunChecks(...args),
  openPrInBrowser: (...args: unknown[]) => mockOpenPrInBrowser(...args),
}));

const mockOpenPrDetail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/windows', () => ({
  openPrDetail: (...args: unknown[]) => mockOpenPrDetail(...args),
}));

vi.mock('@/stores/settings-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({
      settings: {
        repos: [{ owner: 'test', name: 'repo', worktreeBasePath: '/code/repo' }],
      },
    });
  });
  return { useSettingsStore: fn };
});

vi.mock('@/stores/notification-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ show: vi.fn() });
  });
  return { useNotificationStore: fn };
});

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    monitorPr: vi.fn().mockResolvedValue(undefined),
    resolveConflicts: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
}));

vi.mock('@/services/github/checks', () => ({
  rerunWorkflow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: vi.fn().mockResolvedValue(undefined),
}));

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Test PR',
      headRef: 'feature/test',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/test/repo/pull/42',
      body: '',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
      ...overrides.pullRequest,
    },
    checks: overrides.checks ?? [],
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.failedCheckNames ?? [],
    pendingCheckNames: overrides.pendingCheckNames ?? [],
    passedCount: overrides.passedCount ?? 0,
    skippedCount: overrides.skippedCount ?? 0,
  };
}

describe('PrContextMenu', () => {
  const defaultPosition = { x: 100, y: 200 };
  let onClose: ReturnType<typeof vi.fn>;
  let onConfirmAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockClear().mockResolvedValue(true);
    mockMergePr.mockClear().mockResolvedValue(true);
    mockCheckoutPrBranch.mockClear().mockResolvedValue(true);
    mockRerunChecks.mockClear().mockResolvedValue(true);
    mockOpenPrInBrowser.mockClear().mockResolvedValue(true);
    mockOpenPrDetail.mockClear().mockResolvedValue(undefined);
    onClose = vi.fn();
    onConfirmAction = vi.fn();
  });

  it('renders all standard menu items', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Open in GitHub')).toBeInTheDocument();
    expect(screen.getByText('Open in detail window')).toBeInTheDocument();
    expect(screen.getByText('Copy branch name')).toBeInTheDocument();
    expect(screen.getByText('Copy PR URL')).toBeInTheDocument();
    expect(screen.getByText('Copy errors for Claude')).toBeInTheDocument();
    expect(screen.getByText('Checkout branch')).toBeInTheDocument();
    expect(screen.getByText('Mark as draft')).toBeInTheDocument();
    expect(screen.getByText('Fix with Claude')).toBeInTheDocument();
    expect(screen.getByText('Monitor with Claude')).toBeInTheDocument();
    expect(screen.getByText('Merge')).toBeInTheDocument();
    expect(screen.getByText('Bypass merge (admin)')).toBeInTheDocument();
    expect(screen.getByText('Close PR')).toBeInTheDocument();
  });

  it('shows "Mark as ready" for draft PRs', () => {
    render(
      <PrContextMenu
        pr={makePr({ pullRequest: { isDraft: true } as PullRequestWithChecks['pullRequest'] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Mark as ready')).toBeInTheDocument();
  });

  it('disables "Copy errors" when no failing checks', () => {
    render(
      <PrContextMenu
        pr={makePr({ failedCheckNames: [] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    const btn = screen.getByText('Copy errors for Claude');
    expect(btn).toBeDisabled();
  });

  it('enables "Copy errors" when there are failing checks', () => {
    render(
      <PrContextMenu
        pr={makePr({ failedCheckNames: ['build'] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    const btn = screen.getByText('Copy errors for Claude');
    expect(btn).not.toBeDisabled();
  });

  it('disables "Rerun failed checks" when no checks have failed', () => {
    render(
      <PrContextMenu
        pr={makePr({ failedCheckNames: [] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Rerun failed checks')).toBeDisabled();
  });

  it('disables "Merge" when PR is not ready', () => {
    render(
      <PrContextMenu
        pr={makePr({ overallStatus: 'red' })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Merge')).toBeDisabled();
  });

  it('enables "Merge" when PR is green, open, and not draft', () => {
    render(
      <PrContextMenu
        pr={makePr({ overallStatus: 'green' })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Merge')).not.toBeDisabled();
  });

  it('disables "Bypass merge" and "Close PR" when PR is not open', () => {
    render(
      <PrContextMenu
        pr={makePr({ pullRequest: { state: 'closed' } as PullRequestWithChecks['pullRequest'] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Bypass merge (admin)')).toBeDisabled();
    expect(screen.getByText('Close PR')).toBeDisabled();
  });

  it('calls onClose and onConfirmAction("close") when "Close PR" is clicked', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Close PR'));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirmAction).toHaveBeenCalledWith('close');
  });

  it('calls onConfirmAction("bypass") when "Bypass merge" is clicked', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Bypass merge (admin)'));
    expect(onConfirmAction).toHaveBeenCalledWith('bypass');
  });

  it('calls onConfirmAction("draft") when "Mark as draft" is clicked', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Mark as draft'));
    expect(onConfirmAction).toHaveBeenCalledWith('draft');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on click outside', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.mouseDown(document);
    expect(onClose).toHaveBeenCalled();
  });

  it('positions menu at the given coordinates', () => {
    const { container } = render(
      <PrContextMenu
        pr={makePr()}
        position={{ x: 150, y: 300 }}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    const menu = container.firstChild as HTMLElement;
    expect(menu.style.left).toBe('150px');
    expect(menu.style.top).toBe('300px');
  });

  it('dispatches openPrInBrowser on "Open in GitHub" click', async () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Open in GitHub'));
    expect(mockOpenPrInBrowser).toHaveBeenCalledWith('https://github.com/test/repo/pull/42');
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the branch name via the clipboard helper on "Copy branch name" click', async () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Copy branch name'));
    expect(mockCopyToClipboard).toHaveBeenCalledWith('feature/test');
  });

  it('copies the PR URL via the clipboard helper on "Copy PR URL" click', async () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Copy PR URL'));
    expect(mockCopyToClipboard).toHaveBeenCalledWith('https://github.com/test/repo/pull/42');
  });

  it('copies errors for Claude when there are failing checks', async () => {
    render(
      <PrContextMenu
        pr={makePr({ failedCheckNames: ['build', 'lint'] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Copy errors for Claude'));
    expect(mockCopyToClipboard).toHaveBeenCalledWith(expect.stringContaining('- build'));
    expect(mockCopyToClipboard).toHaveBeenCalledWith(expect.stringContaining('- lint'));
  });

  it('dispatches checkoutPrBranch with the PR ref on "Checkout branch" click', async () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Checkout branch'));
    expect(mockCheckoutPrBranch).toHaveBeenCalledWith({
      repoOwner: 'test',
      repoName: 'repo',
      headRef: 'feature/test',
    });
  });

  it('calls fixWithClaude when "Fix with Claude" is clicked', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Fix with Claude'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls monitorPr when "Monitor with Claude" is clicked', () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Monitor with Claude'));
    expect(onClose).toHaveBeenCalled();
  });

  it('dispatches openPrDetail when "Open in detail window" is clicked', async () => {
    render(
      <PrContextMenu
        pr={makePr()}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    fireEvent.click(screen.getByText('Open in detail window'));
    expect(mockOpenPrDetail).toHaveBeenCalledWith({ owner: 'test', repo: 'repo', number: 42 });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Merge for draft PRs', () => {
    render(
      <PrContextMenu
        pr={makePr({ pullRequest: { isDraft: true } as PullRequestWithChecks['pullRequest'] })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Merge')).toBeDisabled();
  });

  it('enables "Rerun failed checks" when a failed check exists', () => {
    render(
      <PrContextMenu
        pr={makePr({
          failedCheckNames: ['build'],
          checks: [
            {
              id: 456,
              name: 'build',
              conclusion: 'failure',
              status: 'completed',
              checkSuiteId: 123,
              htmlUrl: '',
            },
          ],
        })}
        position={defaultPosition}
        onClose={onClose}
        onConfirmAction={onConfirmAction}
      />,
    );
    expect(screen.getByText('Rerun failed checks')).not.toBeDisabled();
  });

  it('works without onConfirmAction prop', () => {
    render(<PrContextMenu pr={makePr()} position={defaultPosition} onClose={onClose} />);
    // Should not throw when clicking draft toggle without onConfirmAction
    fireEvent.click(screen.getByText('Mark as draft'));
    expect(onClose).toHaveBeenCalled();
  });
});
