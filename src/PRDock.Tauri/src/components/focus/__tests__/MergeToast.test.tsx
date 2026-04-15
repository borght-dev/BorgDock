import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MergeToast } from '../MergeToast';

const mockMergePullRequest = vi.fn().mockResolvedValue(undefined);
const mockGetClient = vi.fn().mockReturnValue({ put: vi.fn() });
const mockNotificationShow = vi.fn();

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: (...args: unknown[]) => mockMergePullRequest(...args),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: {
    getState: () => ({ show: mockNotificationShow }),
  },
}));

afterEach(cleanup);

function getQueueMerge(): (owner: string, repo: string, prNumber: number) => void {
  return (
    window as unknown as Record<string, (owner: string, repo: string, prNumber: number) => void>
  ).__prdockQueueMerge;
}

describe('MergeToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMergePullRequest.mockClear().mockResolvedValue(undefined);
    mockGetClient.mockClear().mockReturnValue({ put: vi.fn() });
    mockNotificationShow.mockClear();
    delete (window as unknown as Record<string, unknown>).__prdockQueueMerge;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<MergeToast />);
    expect(container.innerHTML).toBe('');
  });

  it('exposes queueMerge on window', () => {
    render(<MergeToast />);
    expect(getQueueMerge()).toBeDefined();
  });

  it('cleans up window global on unmount', () => {
    const { unmount } = render(<MergeToast />);
    unmount();
    expect(getQueueMerge()).toBeUndefined();
  });

  it('shows toast when queueMerge is called', () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    expect(screen.getByText('Merging PR #42...')).toBeDefined();
  });

  it('shows Undo button on toast', () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    expect(screen.getByText('Undo')).toBeDefined();
  });

  it('removes toast when Undo is clicked before timeout', () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.queryByText('Merging PR #42...')).toBeNull();
  });

  it('does not merge when Undo is clicked before timeout fires', async () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    fireEvent.click(screen.getByText('Undo'));
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(mockMergePullRequest).not.toHaveBeenCalled();
  });

  it('executes merge after 3-second timeout', async () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockMergePullRequest).toHaveBeenCalledWith(
      expect.anything(),
      'owner',
      'repo',
      42,
      'squash',
    );
  });

  it('shows success notification after merge', async () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockNotificationShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'PR #42 merged!',
        severity: 'success',
      }),
    );
  });

  it('shows error notification when merge fails', async () => {
    mockMergePullRequest.mockRejectedValueOnce(new Error('Merge conflict'));
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 99);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockNotificationShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Failed to merge PR #99',
        severity: 'error',
      }),
    );
  });

  it('does not merge when no client is available', async () => {
    mockGetClient.mockReturnValue(null);
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 42);
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockMergePullRequest).not.toHaveBeenCalled();
  });

  it('supports multiple concurrent toasts', () => {
    render(<MergeToast />);
    act(() => {
      getQueueMerge()('owner', 'repo', 10);
      getQueueMerge()('owner', 'repo', 20);
    });
    expect(screen.getByText('Merging PR #10...')).toBeDefined();
    expect(screen.getByText('Merging PR #20...')).toBeDefined();
  });
});
