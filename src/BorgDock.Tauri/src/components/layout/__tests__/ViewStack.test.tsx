import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../SectionView', () => ({
  SectionView: () => (
    <div data-testid="section-view">
      <input aria-label="List search" />
    </div>
  ),
}));

import { useQuickReviewStore } from '@/stores/quick-review-store';
import { type MainView, useUiStore } from '@/stores/ui-store';
import { ViewStack } from '../ViewStack';

const PR: MainView = { kind: 'pr-detail', owner: 'octo', repo: 'app', number: 42 };
const WI: MainView = { kind: 'work-item-detail', id: 1234 };

function depth() {
  return useUiStore.getState().viewStack.length;
}

function push(view: MainView) {
  act(() => useUiStore.getState().pushView(view));
}

function listLayer() {
  return screen.getByTestId('section-view').parentElement as HTMLElement;
}

function escapeEvent() {
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
}

/**
 * jsdom has no AnimationEvent, so React listens for the vendor-prefixed
 * name; fire both so the handler runs either way.
 */
function endAnimation(el: Element) {
  fireEvent.animationEnd(el);
  fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true }));
}

describe('ViewStack', () => {
  beforeEach(() => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
    useQuickReviewStore.setState({ state: 'idle' });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('renders the list and no detail view at depth 1', () => {
    render(<ViewStack />);
    expect(screen.getByTestId('section-view')).toBeInTheDocument();
    expect(listLayer()).not.toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('renders a pushed PR detail on top of the list and makes the list inert', () => {
    render(<ViewStack />);
    push(PR);
    expect(screen.getByRole('heading', { name: '#42' })).toBeInTheDocument();
    expect(screen.getByText('octo/app')).toBeInTheDocument();
    // The list stays mounted (scroll position survives) but is inert.
    expect(screen.getByTestId('section-view')).toBeInTheDocument();
    expect(listLayer()).toHaveAttribute('inert');
  });

  it('renders a pushed work item detail', () => {
    render(<ViewStack />);
    push(WI);
    expect(screen.getByRole('heading', { name: 'AB#1234' })).toBeInTheDocument();
  });

  it('Back pops the detail view', () => {
    render(<ViewStack />);
    push(PR);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(depth()).toBe(1);
    expect(listLayer()).not.toHaveAttribute('inert');
  });

  describe('keyboard and mouse', () => {
    it('Esc pops when a detail view is showing', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(depth()).toBe(1);
    });

    it('Esc pops one level at a time', () => {
      render(<ViewStack />);
      push(PR);
      push(WI);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }, PR]);
    });

    it('Esc at depth 1 does nothing and leaves the event alone', () => {
      render(<ViewStack />);
      const event = escapeEvent();
      document.body.dispatchEvent(event);
      expect(depth()).toBe(1);
      expect(event.defaultPrevented).toBe(false);
    });

    it('Esc does not pop while an input has focus', () => {
      render(<ViewStack />);
      push(PR);
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(depth()).toBe(2);
      input.remove();
    });

    it('Esc does not pop while a dialog is open', () => {
      render(<ViewStack />);
      push(PR);
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(depth()).toBe(2);
      dialog.remove();
    });

    it('a dialog left open inside the inert list does not block Esc', () => {
      render(<ViewStack />);
      push(PR);
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      screen.getByTestId('section-view').appendChild(dialog);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(depth()).toBe(1);
    });

    it('Esc does not pop while Quick Review is open', () => {
      render(<ViewStack />);
      push(PR);
      useQuickReviewStore.setState({ state: 'reviewing' });
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(depth()).toBe(2);
    });

    it('Esc already claimed by another handler (defaultPrevented) does not pop', () => {
      render(<ViewStack />);
      push(PR);
      const claim = (e: KeyboardEvent) => e.preventDefault();
      document.addEventListener('keydown', claim);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      document.removeEventListener('keydown', claim);
      expect(depth()).toBe(2);
    });

    it('Alt+ArrowLeft pops', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true });
      expect(depth()).toBe(1);
    });

    it('plain ArrowLeft does not pop', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(depth()).toBe(2);
    });

    it('the mouse back button pops', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.mouseUp(document.body, { button: 3 });
      expect(depth()).toBe(1);
    });

    it('other mouse buttons do not pop', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.mouseUp(document.body, { button: 0 });
      fireEvent.mouseUp(document.body, { button: 4 });
      expect(depth()).toBe(2);
    });

    it('stops claiming Esc once back at the list', () => {
      render(<ViewStack />);
      push(PR);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      const event = escapeEvent();
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('fallback transition', () => {
    it('animates the pushed detail in', () => {
      render(<ViewStack />);
      push(PR);
      const layer = screen.getByRole('heading', { name: '#42' }).closest('.bd-viewstack__layer');
      expect(layer).toHaveClass('bd-viewstack__detail--entering');
    });

    it('keeps the popped detail for the exit animation, then removes it', () => {
      vi.useFakeTimers();
      render(<ViewStack />);
      push(PR);
      act(() => useUiStore.getState().popView());
      const leaving = screen.getByRole('heading', { name: '#42', hidden: true });
      expect(leaving.closest('.bd-viewstack__layer')).toHaveClass('bd-viewstack__detail--leaving');
      act(() => vi.advanceTimersByTime(400));
      expect(screen.queryByRole('heading', { name: '#42', hidden: true })).not.toBeInTheDocument();
    });

    it('drops the popped detail as soon as its exit animation ends', () => {
      render(<ViewStack />);
      push(PR);
      act(() => useUiStore.getState().popView());
      const layer = screen
        .getByRole('heading', { name: '#42', hidden: true })
        .closest('.bd-viewstack__layer') as HTMLElement;
      endAnimation(layer);
      expect(screen.queryByRole('heading', { name: '#42', hidden: true })).not.toBeInTheDocument();
    });

    it('drops the popped detail at once under reduced motion', () => {
      document.documentElement.classList.add('reduce-motion');
      render(<ViewStack />);
      push(PR);
      act(() => useUiStore.getState().popView());
      expect(screen.queryByRole('heading', { name: '#42', hidden: true })).not.toBeInTheDocument();
    });
  });
});
