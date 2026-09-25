import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, TOAST_DURATION_MS, toastError, useToastStore } from '@/stores/toast-store';
import { Toast, ToastViewport } from '../Toast';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clear();
});
afterEach(() => {
  cleanup();
  useToastStore.getState().clear();
  vi.useRealTimers();
});

function messages() {
  return [...document.querySelectorAll('[data-toast] .bd-toast__message')].map(
    (el) => el.textContent,
  );
}

describe('Toast', () => {
  it('renders the message, an action and a close button', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast message="Snoozed" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Snoozed');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('announces errors as alerts', () => {
    render(<Toast message="Merge failed" tone="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Merge failed');
  });
});

describe('ToastViewport', () => {
  it('keeps its polite live region mounted while empty', () => {
    const { container } = render(<ToastViewport />);
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.children).toHaveLength(0);
  });

  it('stacks at most three toasts, the newest last', () => {
    render(<ToastViewport />);
    act(() => {
      for (const n of [1, 2, 3, 4]) showToast({ message: `Toast ${n}` });
    });
    expect(messages()).toEqual(['Toast 2', 'Toast 3', 'Toast 4']);
    // The hidden one still counts and comes back when a newer one leaves.
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[2]!);
    });
    expect(messages()).toEqual(['Toast 1', 'Toast 2', 'Toast 3']);
  });

  it('hides the oldest toast without an action first, so Undo stays reachable', () => {
    const onExpire = vi.fn();
    render(<ToastViewport />);
    act(() => {
      showToast({ message: 'Merging #1', actionLabel: 'Undo', onAction: () => {}, onExpire });
      for (const n of [2, 3, 4]) showToast({ message: `Toast ${n}` });
    });
    expect(messages()).toEqual(['Merging #1', 'Toast 3', 'Toast 4']);
  });

  it('holds a hidden action toast until it is visible again', () => {
    const onExpire = vi.fn();
    render(<ToastViewport />);
    act(() => {
      showToast({ message: 'Undo 1', actionLabel: 'Undo', onAction: () => {}, onExpire });
      for (const n of [2, 3, 4])
        showToast({ message: `Undo ${n}`, actionLabel: 'Undo', onAction: () => {}, durationMs: 0 });
    });
    expect(messages()).toEqual(['Undo 2', 'Undo 3', 'Undo 4']);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 3);
    });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[2]!);
    });
    expect(messages()).toEqual(['Undo 1', 'Undo 2', 'Undo 3']);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('draws no close button on a toast that is not dismissible', () => {
    render(<ToastViewport />);
    act(() => {
      showToast({
        message: 'Merging',
        actionLabel: 'Undo',
        onAction: () => {},
        dismissible: false,
      });
    });
    expect(screen.queryByRole('button', { name: 'Dismiss notification' })).toBeNull();
  });

  it('auto-dismisses after the default delay and runs onExpire', () => {
    const onExpire = vi.fn();
    render(<ToastViewport />);
    act(() => {
      showToast({ message: 'Merged #4', onExpire });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(messages()).toEqual(['Merged #4']);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(messages()).toEqual([]);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('runs the action and dismisses without expiring', () => {
    const onAction = vi.fn();
    const onExpire = vi.fn();
    render(<ToastViewport />);
    act(() => {
      showToast({ message: 'Merging', actionLabel: 'Undo', onAction, onExpire, durationMs: 3000 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('keeps a sticky toast until it is dismissed', () => {
    render(<ToastViewport />);
    act(() => {
      showToast({ message: 'Sticky', durationMs: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(messages()).toEqual(['Sticky']);
  });

  it('formats error toasts with their cause', () => {
    render(<ToastViewport />);
    act(() => {
      toastError('Merge failed', new Error('Not mergeable'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Merge failed: Not mergeable');
  });
});
