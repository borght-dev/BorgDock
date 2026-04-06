import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationOverlay } from '../NotificationOverlay';
import { useNotificationStore } from '@/stores/notification-store';
import type { InAppNotification } from '@/types';

// Mock NotificationBubble
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

describe('NotificationOverlay', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('renders nothing when no active notifications', () => {
    const { container } = render(<NotificationOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('renders notification bubbles from the store', () => {
    const store = useNotificationStore.getState();
    store.show({
      title: 'PR Updated',
      message: 'Checks are running',
      severity: 'info',
      actions: [],
    });

    render(<NotificationOverlay />);
    expect(screen.getByText('PR Updated')).toBeDefined();
  });

  it('renders multiple active notifications', () => {
    const store = useNotificationStore.getState();
    store.show({
      title: 'First',
      message: 'msg',
      severity: 'info',
      actions: [],
    });
    store.show({
      title: 'Second',
      message: 'msg',
      severity: 'success',
      actions: [],
    });

    render(<NotificationOverlay />);
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
  });

  it('dismisses a notification when clicking dismiss', () => {
    const store = useNotificationStore.getState();
    store.show({
      title: 'Dismissable',
      message: 'msg',
      severity: 'info',
      actions: [],
    });

    render(<NotificationOverlay />);
    expect(screen.getByText('Dismissable')).toBeDefined();

    // Dismiss the notification
    const dismissBtn = screen.getByTestId('dismiss');
    dismissBtn.click();

    // After dismissal the store should have empty active
    expect(useNotificationStore.getState().active).toHaveLength(0);
  });

  it('renders in a fixed positioned container', () => {
    const store = useNotificationStore.getState();
    store.show({
      title: 'Test',
      message: 'msg',
      severity: 'info',
      actions: [],
    });

    const { container } = render(<NotificationOverlay />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('right-3');
    expect(wrapper.className).toContain('top-3');
  });
});
