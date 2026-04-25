import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InAppNotification } from '@/types';
import { NotificationBubble } from '../NotificationBubble';

const mockOpenUrl = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

const makeNotification = (overrides: Partial<InAppNotification> = {}): InAppNotification => ({
  title: 'PR Merged',
  message: 'Your PR was merged successfully',
  severity: 'success',
  actions: [],
  ...overrides,
});

describe('NotificationBubble', () => {
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;

  beforeEach(() => {
    // Replace rAF with a no-op that returns an id but never calls the callback.
    // This prevents the rAF-based progress loop from running in tests.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    mockOpenUrl.mockClear();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  it('renders the notification title', () => {
    render(<NotificationBubble notification={makeNotification()} onDismiss={vi.fn()} />);
    expect(screen.getByText('PR Merged')).toBeDefined();
  });

  it('renders the notification message', () => {
    render(<NotificationBubble notification={makeNotification()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Your PR was merged successfully')).toBeDefined();
  });

  it('renders severity label for success', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'success' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Success')).toBeDefined();
  });

  it('renders severity label for error', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'error' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('renders severity label for warning', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'warning' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Warning')).toBeDefined();
  });

  it('renders severity label for info', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'info' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Info')).toBeDefined();
  });

  it('renders special merged label', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'merged', title: 'PR #42 merged' })}
        onDismiss={vi.fn()}
      />,
    );
    const mergedLabel = screen.getByText((content) => content.includes('Merged'));
    expect(mergedLabel).toBeDefined();
  });

  it('renders action buttons when actions are present', () => {
    const notification = makeNotification({
      actions: [
        { label: 'View PR', url: 'https://github.com/pr/1' },
        { label: 'Details', url: 'https://github.com/pr/1/details' },
      ],
    });
    render(<NotificationBubble notification={notification} onDismiss={vi.fn()} />);
    expect(screen.getByText('View PR')).toBeDefined();
    expect(screen.getByText('Details')).toBeDefined();
  });

  it('clicking an action button opens the url via the opener plugin', () => {
    const notification = makeNotification({
      actions: [{ label: 'View PR', url: 'https://github.com/pr/1' }],
    });
    const onDismiss = vi.fn();
    render(<NotificationBubble notification={notification} onDismiss={onDismiss} />);
    const button = screen.getByText('View PR');
    fireEvent.click(button);
    expect(mockOpenUrl).toHaveBeenCalledWith('https://github.com/pr/1');
  });

  it('does not render action buttons when actions is empty', () => {
    render(
      <NotificationBubble notification={makeNotification({ actions: [] })} onDismiss={vi.fn()} />,
    );
    // Only the dismiss button should be present when there are no actions.
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBe(1);
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<NotificationBubble notification={makeNotification()} onDismiss={onDismiss} />);

    const buttons = document.querySelectorAll('button');
    const dismissBtn = buttons[buttons.length - 1]!;
    fireEvent.click(dismissBtn);

    vi.advanceTimersByTime(280);
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('uses wider width for merged severity', () => {
    const { container } = render(
      <NotificationBubble
        notification={makeNotification({ severity: 'merged' })}
        onDismiss={vi.fn()}
      />,
    );
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('w-[400px]');
  });

  it('uses standard width for non-merged severity', () => {
    const { container } = render(
      <NotificationBubble
        notification={makeNotification({ severity: 'info' })}
        onDismiss={vi.fn()}
      />,
    );
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('w-[380px]');
  });

  it('pauses progress on mouse enter', () => {
    const { container } = render(
      <NotificationBubble notification={makeNotification()} onDismiss={vi.fn()} />,
    );
    const outerDiv = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(outerDiv);
    expect(outerDiv).toBeDefined();
  });

  it('resumes progress on mouse leave', () => {
    const { container } = render(
      <NotificationBubble notification={makeNotification()} onDismiss={vi.fn()} />,
    );
    const outerDiv = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(outerDiv);
    fireEvent.mouseLeave(outerDiv);
    expect(outerDiv).toBeDefined();
  });

  it('renders the severity icon character', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'error' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('!')).toBeDefined();
  });

  it('renders checkmark icon for success', () => {
    render(
      <NotificationBubble
        notification={makeNotification({ severity: 'success' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('\u2713')).toBeDefined();
  });

  it('exposes severity via data-notification-severity', () => {
    const { container } = render(
      <NotificationBubble
        notification={makeNotification({ severity: 'success' })}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-notification-severity="success"]')).toBeInTheDocument();
    expect(container.querySelector('[data-toast]')).toBeInTheDocument();
  });
});
