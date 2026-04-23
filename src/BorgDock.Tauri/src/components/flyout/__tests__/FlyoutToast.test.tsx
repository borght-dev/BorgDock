import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FlyoutToast } from '../FlyoutToast';
import type { ToastPayload } from '../flyout-mode';
import { TOAST_AUTOHIDE_MS } from '../flyout-mode';

const makeToast = (id: string, overrides: Partial<ToastPayload> = {}): ToastPayload => ({
  id,
  severity: 'error',
  title: `Title ${id}`,
  body: `Body ${id}`,
  actions: [],
  ...overrides,
});

describe('FlyoutToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders one card per queue item', () => {
    render(
      <FlyoutToast
        queue={[makeToast('a'), makeToast('b')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={vi.fn()}
        onActionClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Title a')).toBeDefined();
    expect(screen.getByText('Title b')).toBeDefined();
  });

  it('fires onExpire after TOAST_AUTOHIDE_MS', () => {
    const onExpire = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={onExpire}
        onActionClick={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('pauses timer on mouse enter and resumes on leave', () => {
    const onExpire = vi.fn();
    render(
      <FlyoutToast
        queue={[makeToast('a')]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={onExpire}
        onActionClick={vi.fn()}
      />,
    );
    const card = screen.getByTestId('flyout-toast-card-a');
    act(() => {
      fireEvent.mouseEnter(card);
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      fireEvent.mouseLeave(card);
      vi.advanceTimersByTime(TOAST_AUTOHIDE_MS + 10);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('invokes onActionClick with action + payload when a button is clicked', () => {
    const onActionClick = vi.fn();
    const t = makeToast('a', {
      actions: [{ label: 'Fix', action: 'fix-pr' }],
    });
    render(
      <FlyoutToast
        queue={[t]}
        onHoverEnter={vi.fn()}
        onHoverLeave={vi.fn()}
        onExpire={vi.fn()}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
    expect(onActionClick).toHaveBeenCalledWith(t, 'fix-pr', undefined);
  });
});
