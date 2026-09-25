import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastViewport } from '@/components/shared/Toast';
import { useToastStore } from '@/stores/toast-store';
import { MergeToast } from '../MergeToast';

/** MergeToast draws through the shared toast stack, which App mounts beside it. */
function render(ui: ReactElement) {
  return rtlRender(
    <>
      {ui}
      <ToastViewport />
    </>,
  );
}

const mockMergePr = vi.fn().mockResolvedValue(true);
const { mockNotificationShow } = vi.hoisted(() => ({
  mockNotificationShow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/pr-actions', () => ({
  mergePr: (...args: unknown[]) => mockMergePr(...args),
}));

vi.mock('@/services/notification', () => ({
  sendOsNotification: mockNotificationShow,
}));

afterEach(cleanup);

function getQueueMerge(): ((owner: string, repo: string, prNumber: number) => void) | undefined {
  return (
    window as unknown as {
      __borgdockQueueMerge?: (owner: string, repo: string, prNumber: number) => void;
    }
  ).__borgdockQueueMerge;
}

function requireQueueMerge(): (owner: string, repo: string, prNumber: number) => void {
  const fn = getQueueMerge();
  if (!fn) throw new Error('__borgdockQueueMerge not installed');
  return fn;
}

describe('MergeToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMergePr.mockClear().mockResolvedValue(true);
    mockNotificationShow.mockClear();
    useToastStore.getState().clear();
    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no toast until a merge is queued', () => {
    const { container } = render(<MergeToast />);
    expect(container.querySelectorAll('[data-toast]')).toHaveLength(0);
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
      requireQueueMerge()('owner', 'repo', 42);
    });
    expect(screen.getByText(/PR #42/)).toBeDefined();
    expect(screen.getByText('Merging')).toBeDefined();
  });

  it('renders the toast inside a [data-toast] container with a success Pill', () => {
    const { container } = render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    const toast = container.querySelector('[data-toast]');
    expect(toast).not.toBeNull();
    const pill = toast?.querySelector('.bd-pill');
    expect(pill).not.toBeNull();
    expect(pill?.classList.contains('bd-pill--success')).toBe(true);
    expect(pill?.textContent).toContain('Merging');
  });

  it('shows Undo button on toast', () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    expect(screen.getByText('Undo')).toBeDefined();
  });

  it('removes toast when Undo is clicked before timeout', () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.queryByText(/PR #42/)).toBeNull();
  });

  it('does not merge when Undo is clicked before timeout fires', async () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    fireEvent.click(screen.getByText('Undo'));
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(mockMergePr).not.toHaveBeenCalled();
  });

  it('executes merge after 3-second timeout, pinned to squash method', async () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockMergePr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, repoOwner: 'owner', repoName: 'repo' }),
      expect.objectContaining({ method: 'squash' }),
    );
  });

  it('toasts a PR-specific error through the onError override', async () => {
    // Drive the onError path by capturing the opts and invoking it ourselves —
    // pr-actions itself is mocked so it never fails on its own.
    let capturedOpts: { onError?: (title: string, err: unknown) => void } | undefined;
    mockMergePr.mockImplementationOnce((_pr: unknown, opts: typeof capturedOpts) => {
      capturedOpts = opts;
      return Promise.resolve(false);
    });
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 99);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(capturedOpts?.onError).toBeDefined();
    act(() => {
      capturedOpts?.onError?.('ignored', new Error('Merge conflict'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to merge PR #99: Merge conflict');
    expect(mockNotificationShow).not.toHaveBeenCalled();
  });

  it('leaves the success to the merge celebration, with no second in-window toast', async () => {
    const { container } = render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 7);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockMergePr).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('[data-toast]')).toHaveLength(0);
  });

  it('has no close button: only Undo cancels the merge', () => {
    render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 42);
    });
    expect(screen.queryByRole('button', { name: 'Dismiss notification' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('supports multiple concurrent toasts', () => {
    const { container } = render(<MergeToast />);
    act(() => {
      requireQueueMerge()('owner', 'repo', 10);
      requireQueueMerge()('owner', 'repo', 20);
    });
    expect(screen.getByText(/PR #10/)).toBeDefined();
    expect(screen.getByText(/PR #20/)).toBeDefined();
    expect(container.querySelectorAll('[data-toast]').length).toBe(2);
  });
});
