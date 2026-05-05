import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FlyoutToast } from '../FlyoutToast';
import type { ToastPayload } from '../flyout-mode';

const makeToast = (id: string, overrides: Partial<ToastPayload> = {}): ToastPayload => ({
  id,
  severity: 'error',
  title: `Title ${id}`,
  body: `Body ${id}`,
  actions: [],
  ...overrides,
});

describe('FlyoutToast', () => {
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;

  beforeEach(() => {
    // Disable the rAF-driven auto-dismiss loop so tests aren't time-sensitive.
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  it('renders one card per queue item', () => {
    render(
      <FlyoutToast
        queue={[makeToast('a'), makeToast('b')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Title a')).toBeDefined();
    expect(screen.getByText('Title b')).toBeDefined();
  });

  it('renders the toast container with data-toast', () => {
    const { container } = render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-toast]')).toBeInTheDocument();
  });

  it('exposes severity via data-notification-severity', () => {
    const { container } = render(
      <FlyoutToast
        queue={[makeToast('a', { severity: 'success' })]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-notification-severity="success"]')).toBeInTheDocument();
  });

  it('invokes onActionClick with action + payload when an action button is clicked', () => {
    const onActionClick = vi.fn();
    const t = makeToast('a', { actions: [{ label: 'Fix', action: 'fix-pr' }] });
    render(
      <FlyoutToast
        queue={[t]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
    expect(onActionClick).toHaveBeenCalledWith(t, 'fix-pr', undefined);
  });

  it('calls onDismiss with the card id when the dismiss button is clicked', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      render(
        <FlyoutToast
          queue={[makeToast('a')]}
          onHoverEnter={vi.fn()}
          onHoverLeave={vi.fn()}
          onDismiss={onDismiss}
          onActionClick={vi.fn()}
        />,
      );
      const dismissBtn = screen.getByTestId('dismiss-flyout-toast');
      fireEvent.click(dismissBtn);
      // 280ms slide-out before onDismiss fires.
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onDismiss).toHaveBeenCalledWith('a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking the card body fires open-pr when the toast has PR context', () => {
    const onActionClick = vi.fn();
    const t = makeToast('a', { prOwner: 'octo', prRepo: 'demo', prNumber: 42 });
    render(
      <FlyoutToast
        queue={[t]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByTestId('flyout-toast-card-a'));
    expect(onActionClick).toHaveBeenCalledWith(t, 'open-pr', undefined);
  });

  it('clicking the card body is a no-op when the toast has no PR context', () => {
    const onActionClick = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByTestId('flyout-toast-card-a'));
    expect(onActionClick).not.toHaveBeenCalled();
  });

  it('clicking the dismiss button does not also trigger open-pr', () => {
    vi.useFakeTimers();
    try {
      const onActionClick = vi.fn();
      const onDismiss = vi.fn();
      const t = makeToast('a', { prOwner: 'octo', prRepo: 'demo', prNumber: 42 });
      render(
        <FlyoutToast
          queue={[t]}
          onHoverEnter={vi.fn()}
          onHoverLeave={vi.fn()}
          onDismiss={onDismiss}
          onActionClick={onActionClick}
        />,
      );
      fireEvent.click(screen.getByTestId('dismiss-flyout-toast'));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onDismiss).toHaveBeenCalledWith('a');
      expect(onActionClick).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking an action button does not also trigger open-pr', () => {
    const onActionClick = vi.fn();
    const t = makeToast('a', {
      prOwner: 'octo',
      prRepo: 'demo',
      prNumber: 42,
      actions: [{ label: 'Fix', action: 'fix-pr' }],
    });
    render(
      <FlyoutToast
        queue={[t]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onDismiss={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onActionClick).toHaveBeenCalledWith(t, 'fix-pr', undefined);
  });

  it('forwards mouse-enter / mouse-leave to the parent (so the parent can pause its own state)', () => {
    const onHoverEnter = vi.fn();
    const onHoverLeave = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={onHoverEnter}
        onHoverLeave={onHoverLeave}
        onDismiss={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    const card = screen.getByTestId('flyout-toast-card-a');
    fireEvent.mouseEnter(card);
    expect(onHoverEnter).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(card);
    expect(onHoverLeave).toHaveBeenCalledTimes(1);
  });
});
