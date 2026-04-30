import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/mutations', () => ({
  postComment: vi.fn().mockResolvedValue(undefined),
  submitReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => ({})),
}));

const mockMergePr = vi.fn().mockResolvedValue(true);
const mockBypassMergePr = vi.fn().mockResolvedValue(true);
const mockClosePr = vi.fn().mockResolvedValue(true);
const mockToggleDraftPr = vi.fn().mockResolvedValue(true);

vi.mock('@/services/pr-actions', () => ({
  mergePr: (...args: unknown[]) => mockMergePr(...args),
  bypassMergePr: (...args: unknown[]) => mockBypassMergePr(...args),
  closePr: (...args: unknown[]) => mockClosePr(...args),
  toggleDraftPr: (...args: unknown[]) => mockToggleDraftPr(...args),
}));

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    resolveConflicts: vi.fn().mockResolvedValue(undefined),
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWorkItemLinks', () => ({
  useWorkItemLinks: () => ({
    workItemIds: [],
    workItems: [],
    isLoading: false,
  }),
}));

vi.mock('@/components/onboarding', () => ({
  FeatureBadge: () => null,
  InlineHint: () => null,
}));

const mockCelebrate = vi.fn();
vi.mock('@/services/merge-celebration', () => ({
  celebrateMerge: (...args: unknown[]) => mockCelebrate(...args),
}));

vi.mock('../MergeReadinessChecklist', () => ({
  MergeReadinessChecklist: () => <div data-testid="merge-readiness">Merge Readiness</div>,
}));

vi.mock('../LinkedWorkItemBadge', () => ({
  LinkedWorkItemBadge: () => <div data-testid="linked-work-item">Work Item</div>,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: () => {},
}));

import { OverviewTab } from '../OverviewTab';

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Add feature X',
      headRef: 'feature-x',
      baseRef: 'main',
      authorLogin: 'developer',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/owner/repo/pull/42',
      body: 'PR description here',
      repoOwner: 'owner',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 5,
      labels: ['bug'],
      additions: 100,
      deletions: 50,
      changedFiles: 8,
      commitCount: 3,
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

describe('OverviewTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCelebrate.mockClear();
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024 },
      },
    });
  });

  it('renders MergeReadinessChecklist', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByTestId('merge-readiness')).toBeTruthy();
  });

  it('renders PR description', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('PR description here')).toBeTruthy();
  });

  it('does not render description block when body is empty', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, body: '' },
    });
    const { container } = render(<OverviewTab pr={pr} />);
    const markdownBodies = container.querySelectorAll('[data-testid="markdown"]');
    // Only the summary or review markdown should exist, not the body
    for (const el of markdownBodies) {
      expect(el.textContent).not.toBe('');
    }
  });

  it('renders action buttons', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Open in Browser')).toBeTruthy();
    expect(screen.getByText('Copy Branch')).toBeTruthy();
    expect(screen.getByText('Checkout')).toBeTruthy();
  });

  it('renders "Mark Draft" button when not draft', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Mark Draft')).toBeTruthy();
  });

  it('renders "Mark Ready" button when draft', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, isDraft: true },
    });
    render(<OverviewTab pr={pr} />);
    expect(screen.getByText('Mark Ready')).toBeTruthy();
  });

  it('renders enabled "Merge" button when PR is ready', () => {
    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    render(<OverviewTab pr={pr} />);
    const btn = screen.getByText('Merge').closest('button');
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(false);
  });

  it('renders disabled "Merge" button when PR is not ready', () => {
    render(<OverviewTab pr={makePr()} />);
    const btn = screen.getByText('Merge').closest('button');
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(true);
  });

  it('renders "Resolve Conflicts" button when not mergeable', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, mergeable: false },
    });
    render(<OverviewTab pr={pr} />);
    // The button contains a diamond character + text
    expect(screen.getByText(/Resolve Conflicts/)).toBeTruthy();
  });

  it('does not render "Resolve Conflicts" when mergeable', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.queryByText(/Resolve Conflicts/)).toBeNull();
  });

  it('renders "Bypass Merge" button', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Bypass Merge')).toBeTruthy();
  });

  it('shows API key message when no Claude API key configured', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024 },
      },
    });
    render(<OverviewTab pr={makePr()} />);
    expect(
      screen.getByText('Configure an API key in Settings to enable AI summaries'),
    ).toBeTruthy();
  });

  it('shows "Summarize with AI" button when API key is set', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: { apiKey: 'sk-test', model: 'claude-sonnet-4-6', maxTokens: 1024 },
      },
    });
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Summarize with AI')).toBeTruthy();
  });

  // ---- Action handlers ----

  it('calls mergePr when "Merge" is clicked', async () => {
    mockMergePr.mockClear();
    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    render(<OverviewTab pr={pr} />);
    fireEvent.click(screen.getByText('Merge'));
    expect(mockMergePr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
      expect.objectContaining({ method: 'squash' }),
    );
  });

  it('calls toggleDraftPr when "Mark Draft" is clicked', async () => {
    mockToggleDraftPr.mockClear();
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Mark Draft'));
    expect(mockToggleDraftPr).toHaveBeenCalled();
  });

  it('shows confirm dialog when "Bypass Merge" is clicked', () => {
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Bypass Merge'));
    expect(screen.getByRole('dialog', { name: 'Bypass merge protections?' })).toBeTruthy();
  });

  it('calls bypassMergePr when dialog confirm is clicked', async () => {
    mockBypassMergePr.mockClear();
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Bypass Merge'));
    const dialog = screen.getByRole('dialog', { name: 'Bypass merge protections?' });
    fireEvent.click(within(dialog).getByText('Bypass Merge'));
    expect(mockBypassMergePr).toHaveBeenCalled();
  });

  it('does not call bypassMergePr when dialog cancel is clicked', async () => {
    mockBypassMergePr.mockClear();
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Bypass Merge'));
    const dialog = screen.getByRole('dialog', { name: 'Bypass merge protections?' });
    fireEvent.click(within(dialog).getByText('Cancel'));
    expect(mockBypassMergePr).not.toHaveBeenCalled();
  });

  it('shows "Summarize with AI" button when API key is configured and can be clicked', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: { apiKey: 'sk-test', model: 'claude-sonnet-4-6', maxTokens: 1024 },
      },
    });

    render(<OverviewTab pr={makePr()} />);
    const btn = screen.getByText('Summarize with AI');
    expect(btn).toBeTruthy();
    // Click should not throw
    fireEvent.click(btn);
  });

  it('renders Checkout button', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Checkout')).toBeTruthy();
  });

  it('forwards the PR ref to mergePr (which celebrates internally)', async () => {
    mockMergePr.mockClear().mockResolvedValue(true);

    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    render(<OverviewTab pr={pr} />);
    fireEvent.click(screen.getByText('Merge'));

    await vi.waitFor(() => {
      expect(mockMergePr).toHaveBeenCalledWith(
        expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
        expect.any(Object),
      );
    });
  });

  it('does not render the inline MergeCelebration card', async () => {
    mockMergePr.mockClear().mockResolvedValue(true);

    const pr = makePr({
      overallStatus: 'green',
      pullRequest: {
        ...makePr().pullRequest,
        isDraft: false,
        mergeable: true,
        reviewStatus: 'approved',
      },
    });
    const { container } = render(<OverviewTab pr={pr} />);
    fireEvent.click(screen.getByText('Merge'));

    await vi.waitFor(() => {
      expect(mockMergePr).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-merge-celebration]')).toBeNull();
  });

  // ---- Close PR ----

  it('renders "Close PR" button when PR is open', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Close PR')).toBeTruthy();
  });

  it('does not render "Close PR" button when PR is closed', () => {
    const pr = makePr({
      pullRequest: { ...makePr().pullRequest, state: 'closed' },
    });
    render(<OverviewTab pr={pr} />);
    expect(screen.queryByText('Close PR')).toBeNull();
  });

  it('shows confirm dialog when "Close PR" is clicked', () => {
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Close PR'));
    expect(screen.getByRole('dialog', { name: 'Close pull request?' })).toBeTruthy();
  });

  it('calls closePr when dialog confirm is clicked', async () => {
    mockClosePr.mockClear();
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Close PR'));
    const dialog = screen.getByRole('dialog', { name: 'Close pull request?' });
    fireEvent.click(within(dialog).getByText('Close PR'));
    expect(mockClosePr).toHaveBeenCalledWith(
      { repoOwner: 'owner', repoName: 'repo', number: 42 },
      expect.any(Object),
    );
  });

  it('does not call closePr when dialog cancel is clicked', async () => {
    mockClosePr.mockClear();
    render(<OverviewTab pr={makePr()} />);
    fireEvent.click(screen.getByText('Close PR'));
    const dialog = screen.getByRole('dialog', { name: 'Close pull request?' });
    fireEvent.click(within(dialog).getByText('Cancel'));
    expect(mockClosePr).not.toHaveBeenCalled();
  });

  // ---- Primitive migration assertions (PR #4 / Task 4) ----

  it('renders action buttons with data-overview-action', () => {
    const { container } = render(<OverviewTab pr={makePr()} />);
    expect(container.querySelector('[data-overview-action="browser"]')).toBeTruthy();
    expect(container.querySelector('[data-overview-action="copy"]')).toBeTruthy();
    expect(container.querySelector('[data-overview-action="checkout"]')).toBeTruthy();
  });

  it('renders Merge primary button regardless of readiness', () => {
    const { container } = render(<OverviewTab pr={makePr()} />);
    expect(container.querySelector('[data-overview-action="merge"]')).toBeTruthy();
  });
});
