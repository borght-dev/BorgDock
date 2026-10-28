import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HoverPopover, isTextClipped } from '../HoverPopover';

/** jsdom lays nothing out: give `el` the widths a cut-off text would have. */
function widths(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

function Clipped({ delay }: { delay?: number }) {
  return (
    <HoverPopover
      variant="tooltip"
      showDelayMs={delay}
      when={isTextClipped}
      content="the whole failure"
    >
      <span data-clip="">the whole fail…</span>
    </HoverPopover>
  );
}

describe('HoverPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a tooltip for clipped text after its delay', () => {
    render(<Clipped />);
    const text = screen.getByText('the whole fail…');
    widths(text, 400, 120);
    fireEvent.mouseEnter(text);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('the whole failure');
    expect(tooltip).toHaveClass('bd-tooltip');
    expect(tooltip).toHaveAttribute('data-side', 'below');
  });

  it('shows nothing while the text fits', () => {
    render(<Clipped delay={0} />);
    const text = screen.getByText('the whole fail…');
    widths(text, 120, 120);
    fireEvent.mouseEnter(text);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('never opens when the cursor passes over before the delay', () => {
    render(<Clipped />);
    const text = screen.getByText('the whole fail…');
    widths(text, 400, 120);
    fireEvent.mouseEnter(text);
    fireEvent.mouseLeave(text);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<Clipped delay={0} />);
    const text = screen.getByText('the whole fail…');
    widths(text, 400, 120);
    fireEvent.mouseEnter(text);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(text, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens a panel at once, without a check', () => {
    render(<HoverPopover content="details">trigger</HoverPopover>);
    fireEvent.mouseEnter(screen.getByText('trigger'));
    const panel = screen.getByRole('tooltip');
    expect(panel).not.toHaveClass('bd-tooltip');
    expect(panel).toHaveTextContent('details');
  });
});
