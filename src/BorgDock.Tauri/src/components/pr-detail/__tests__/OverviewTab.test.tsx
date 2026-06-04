import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

vi.mock('@/services/github/mutations', () => ({
  postComment: vi.fn().mockResolvedValue(undefined),
  submitReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => ({})),
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
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: 0,
    ...overrides,
  };
}

describe('OverviewTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: {
          model: 'claude-sonnet-4-6',
          maxTokens: 1024,
          prSummaryEnabled: true,
          diffExplanationsEnabled: true,
          reviewNudgePhrasingEnabled: false,
          commitMessageSuggestionsEnabled: false,
        },
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

  it('does not render action buttons (those moved to ActionBar)', () => {
    render(<OverviewTab pr={makePr()} />);
    expect(screen.queryByRole('button', { name: /^merge$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open in browser/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy branch/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^close pr$/i })).toBeNull();
  });

  it('shows API key message when no Claude API key configured', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: {
          model: 'claude-sonnet-4-6',
          maxTokens: 1024,
          prSummaryEnabled: true,
          diffExplanationsEnabled: true,
          reviewNudgePhrasingEnabled: false,
          commitMessageSuggestionsEnabled: false,
        },
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
        claudeApi: {
          apiKey: 'sk-test',
          model: 'claude-sonnet-4-6',
          maxTokens: 1024,
          prSummaryEnabled: true,
          diffExplanationsEnabled: true,
          reviewNudgePhrasingEnabled: false,
          commitMessageSuggestionsEnabled: false,
        },
      },
    });
    render(<OverviewTab pr={makePr()} />);
    expect(screen.getByText('Summarize with AI')).toBeTruthy();
  });

  it('shows "Summarize with AI" button when API key is configured and can be clicked', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        claudeApi: {
          apiKey: 'sk-test',
          model: 'claude-sonnet-4-6',
          maxTokens: 1024,
          prSummaryEnabled: true,
          diffExplanationsEnabled: true,
          reviewNudgePhrasingEnabled: false,
          commitMessageSuggestionsEnabled: false,
        },
      },
    });

    render(<OverviewTab pr={makePr()} />);
    const btn = screen.getByText('Summarize with AI');
    expect(btn).toBeTruthy();
  });

  it('does not render the inline MergeCelebration card', async () => {
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
    expect(container.querySelector('[data-merge-celebration]')).toBeNull();
  });

  describe('terminal state UI', () => {
    it('hides Merge / Bypass Merge / Mark Draft / Close PR when state is closed', () => {
      const merged = makePr({
        pullRequest: {
          ...makePr().pullRequest,
          state: 'closed',
          mergedAt: '2026-05-06T12:00:00Z',
        },
      });
      render(<OverviewTab pr={merged} />);
      expect(screen.queryByText('Merge')).toBeNull();
      expect(screen.queryByText('Bypass Merge')).toBeNull();
      expect(screen.queryByText('Mark Draft')).toBeNull();
      expect(screen.queryByText('Mark Ready')).toBeNull();
      expect(screen.queryByText('Close PR')).toBeNull();
    });

    it('does not render action buttons when closed (those moved to ActionBar)', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
      });
      render(<OverviewTab pr={merged} />);
      expect(screen.queryByRole('button', { name: /open in browser/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /copy branch/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /checkout/i })).toBeNull();
    });

    it('renders MergedCard above the action row when merged', () => {
      const merged = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', mergedAt: '2026-05-06T12:00:00Z' },
      });
      const { container } = render(<OverviewTab pr={merged} />);
      const card = container.querySelector('[data-merged-card]');
      expect(card).toBeTruthy();
      expect(card?.getAttribute('data-variant')).toBe('merged');
    });

    it('renders MergedCard with closed variant when state is closed and not merged', () => {
      const closed = makePr({
        pullRequest: { ...makePr().pullRequest, state: 'closed', closedAt: '2026-05-06T12:00:00Z' },
      });
      const { container } = render(<OverviewTab pr={closed} />);
      const card = container.querySelector('[data-merged-card]');
      expect(card?.getAttribute('data-variant')).toBe('closed');
    });

    it('does not render MergedCard for open PRs', () => {
      const { container } = render(<OverviewTab pr={makePr()} />);
      expect(container.querySelector('[data-merged-card]')).toBeNull();
    });
  });
});
