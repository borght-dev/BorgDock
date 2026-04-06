import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuickReviewKeyboard } from '../useQuickReviewKeyboard';
import type { PullRequestWithChecks } from '@/types';

const mockAdvance = vi.fn();
const mockGoBack = vi.fn();
const mockEndSession = vi.fn();
const mockSetSubmitting = vi.fn();
const mockSetError = vi.fn();
const mockCurrentPr = vi.fn<() => PullRequestWithChecks | undefined>();
const mockSubmitReview = vi.fn();
const mockGetClient = vi.fn();

let mockState = 'idle';
let mockIsCommandPaletteOpen = false;

vi.mock('@/stores/quick-review-store', () => ({
  useQuickReviewStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ state: mockState }),
    {
      getState: () => ({
        advance: mockAdvance,
        goBack: mockGoBack,
        endSession: mockEndSession,
        setSubmitting: mockSetSubmitting,
        setError: mockSetError,
        currentPr: mockCurrentPr,
      }),
    },
  ),
}));

vi.mock('@/stores/ui-store', () => ({
  useUiStore: {
    getState: () => ({
      isCommandPaletteOpen: mockIsCommandPaletteOpen,
    }),
  },
}));

vi.mock('@/services/github/mutations', () => ({
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

function makePr(): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 1,
      title: 'Test PR',
      headRef: 'feature',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/test/repo/pull/1',
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
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

function fireKey(key: string, options: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options });
  document.dispatchEvent(event);
}

describe('useQuickReviewKeyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = 'idle';
    mockIsCommandPaletteOpen = false;
  });

  it('does nothing when state is idle', () => {
    mockState = 'idle';
    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');
    expect(mockSetSubmitting).not.toHaveBeenCalled();
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('does nothing when command palette is open', () => {
    mockState = 'reviewing';
    mockIsCommandPaletteOpen = true;
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');
    expect(mockSetSubmitting).not.toHaveBeenCalled();
  });

  it('does not intercept when typing in input', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);

    expect(mockSetSubmitting).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('approves on "a" key', async () => {
    mockState = 'reviewing';
    const pr = makePr();
    mockCurrentPr.mockReturnValue(pr);
    const client = { token: 'test' };
    mockGetClient.mockReturnValue(client);
    mockSubmitReview.mockResolvedValue(undefined);

    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');

    expect(mockSetSubmitting).toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledWith(client, 'test', 'repo', 1, 'APPROVE');
    });

    await vi.waitFor(() => {
      expect(mockAdvance).toHaveBeenCalledWith('approved');
    });
  });

  it('approves on "A" key', async () => {
    mockState = 'reviewing';
    const pr = makePr();
    mockCurrentPr.mockReturnValue(pr);
    const client = { token: 'test' };
    mockGetClient.mockReturnValue(client);
    mockSubmitReview.mockResolvedValue(undefined);

    renderHook(() => useQuickReviewKeyboard());
    fireKey('A');

    expect(mockSetSubmitting).toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mockAdvance).toHaveBeenCalledWith('approved');
    });
  });

  it('sets error when approve fails', async () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());
    mockGetClient.mockReturnValue({ token: 'test' });
    mockSubmitReview.mockRejectedValue(new Error('network error'));

    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');

    await vi.waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(expect.stringContaining('Approve failed'));
    });
  });

  it('does not approve when no client', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());
    mockGetClient.mockReturnValue(null);

    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');

    expect(mockSetSubmitting).not.toHaveBeenCalled();
  });

  it('skips on "s" key', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('s');
    expect(mockAdvance).toHaveBeenCalledWith('skipped');
  });

  it('skips on "S" key', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('S');
    expect(mockAdvance).toHaveBeenCalledWith('skipped');
  });

  it('skips on ArrowRight', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('ArrowRight');
    expect(mockAdvance).toHaveBeenCalledWith('skipped');
  });

  it('goes back on ArrowLeft', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('ArrowLeft');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('ends session on Escape', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());

    renderHook(() => useQuickReviewKeyboard());
    fireKey('Escape');
    expect(mockEndSession).toHaveBeenCalled();
  });

  it('does nothing when no current PR', () => {
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(undefined);

    renderHook(() => useQuickReviewKeyboard());
    fireKey('a');
    expect(mockSetSubmitting).not.toHaveBeenCalled();
    fireKey('s');
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('removes event listener on unmount', () => {
    mockState = 'reviewing';
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useQuickReviewKeyboard());
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });

  it('reacts to state changes', () => {
    mockState = 'idle';
    const { rerender } = renderHook(() => useQuickReviewKeyboard());

    fireKey('s');
    expect(mockAdvance).not.toHaveBeenCalled();

    // Simulate state change to reviewing
    mockState = 'reviewing';
    mockCurrentPr.mockReturnValue(makePr());
    rerender();

    fireKey('s');
    expect(mockAdvance).toHaveBeenCalledWith('skipped');
  });
});
