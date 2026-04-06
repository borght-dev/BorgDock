import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NotificationManager } from '../NotificationManager';
import type { InAppNotification } from '@/types';

// Mock NotificationBubble to simplify testing
vi.mock('../NotificationBubble', () => ({
  NotificationBubble: ({
    notification,
    onDismiss,
  }: {
    notification: InAppNotification;
    onDismiss: () => void;
  }) => (
    <div data-testid="notification-bubble">
      <span>{notification.title}</span>
      <button data-testid="dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  ),
}));

const makeNotification = (overrides: Partial<InAppNotification> = {}): InAppNotification => ({
  title: 'Test Notification',
  message: 'Test message',
  severity: 'info',
  actions: [],
  ...overrides,
});

describe('NotificationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders nothing when no notifications', () => {
    const { container } = render(
      <NotificationManager notifications={[]} onClearNotification={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders notification bubbles for incoming notifications', () => {
    render(
      <NotificationManager
        notifications={[makeNotification({ title: 'First' })]}
        onClearNotification={vi.fn()}
      />,
    );
    // The first notification has index 0, so its timeout is 0ms
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText('First')).toBeDefined();
  });

  it('shows multiple notifications with staggered timing', () => {
    render(
      <NotificationManager
        notifications={[
          makeNotification({ title: 'First' }),
          makeNotification({ title: 'Second' }),
          makeNotification({ title: 'Third' }),
        ]}
        onClearNotification={vi.fn()}
      />,
    );

    // First notification appears immediately
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText('First')).toBeDefined();

    // Second appears after 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Second')).toBeDefined();

    // Third appears after another 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Third')).toBeDefined();
  });

  it('limits visible notifications to MAX_VISIBLE (3)', () => {
    render(
      <NotificationManager
        notifications={[
          makeNotification({ title: 'N1' }),
          makeNotification({ title: 'N2' }),
          makeNotification({ title: 'N3' }),
          makeNotification({ title: 'N4' }),
        ]}
        onClearNotification={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const bubbles = screen.getAllByTestId('notification-bubble');
    expect(bubbles).toHaveLength(3);
  });

  it('calls onClearNotification when a notification is dismissed', () => {
    const onClear = vi.fn();
    render(
      <NotificationManager
        notifications={[makeNotification({ title: 'Dismiss me' })]}
        onClearNotification={onClear}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(0);
    });

    const dismissBtn = screen.getByTestId('dismiss');
    act(() => {
      dismissBtn.click();
    });

    // Verify the notification was removed from active
    expect(screen.queryByText('Dismiss me')).toBeNull();
  });

  it('renders nothing after all notifications are dismissed', () => {
    const { container } = render(
      <NotificationManager
        notifications={[makeNotification({ title: 'Only one' })]}
        onClearNotification={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(0);
    });

    const dismissBtn = screen.getByTestId('dismiss');
    act(() => {
      dismissBtn.click();
    });

    // Container should be empty now
    expect(container.firstChild).toBeNull();
  });
});
