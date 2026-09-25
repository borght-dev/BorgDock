import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { type QuickReviewKeymap, useQuickReviewKeyboard } from '../useQuickReviewKeyboard';

afterEach(cleanup);
beforeEach(() => useQuickReviewStore.setState({ state: 'reviewing' }));

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function walkKeys() {
  return { v: vi.fn(), n: vi.fn(), p: vi.fn(), j: vi.fn(), k: vi.fn(), Escape: vi.fn() };
}

describe('Quick review keyboard', () => {
  it('runs the walk keys and never approves or skips from them', () => {
    const keys = walkKeys();
    renderHook(() => useQuickReviewKeyboard(keys));
    for (const key of ['n', 'p', 'v', 'j', 'k', 'a', 's', 'ArrowRight', 'ArrowLeft']) press(key);
    expect(keys.n).toHaveBeenCalledTimes(1);
    expect(keys.p).toHaveBeenCalledTimes(1);
    expect(keys.v).toHaveBeenCalledTimes(1);
    expect(keys.j).toHaveBeenCalledTimes(1);
    expect(keys.k).toHaveBeenCalledTimes(1);
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
  });

  it('matches letters case-insensitively and marks the key handled', () => {
    const keys = walkKeys();
    renderHook(() => useQuickReviewKeyboard(keys));
    const event = press('V', { shiftKey: true });
    expect(keys.v).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(press('x').defaultPrevented).toBe(false);
  });

  it('runs the card keys: arrows decide, Enter opens the files, Esc closes', () => {
    const keys: QuickReviewKeymap = {
      ArrowRight: vi.fn(),
      ArrowLeft: vi.fn(),
      Enter: vi.fn(),
      Escape: vi.fn(),
    };
    renderHook(() => useQuickReviewKeyboard(keys));
    for (const key of ['ArrowRight', 'ArrowLeft', 'Enter', 'Escape']) press(key);
    for (const action of Object.values(keys)) expect(action).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter on a button to the button', () => {
    const keys: QuickReviewKeymap = { Enter: vi.fn() };
    renderHook(() => useQuickReviewKeyboard(keys));
    const button = document.createElement('button');
    document.body.append(button);
    press('Enter', {}, button);
    button.remove();
    expect(keys.Enter).not.toHaveBeenCalled();
  });

  it('ignores typing, modified shortcuts, handled keys and submissions', () => {
    const keys = walkKeys();
    renderHook(() => useQuickReviewKeyboard(keys));
    const input = document.createElement('textarea');
    document.body.append(input);
    press('n', {}, input);
    press('Escape', {}, input);
    input.remove();
    press('n', { ctrlKey: true });
    const handled = new KeyboardEvent('keydown', { key: 'n', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    useQuickReviewStore.setState({ state: 'submitting' });
    press('n');
    expect(keys.n).not.toHaveBeenCalled();
    expect(keys.Escape).not.toHaveBeenCalled();
  });

  it('follows the latest keymap and unregisters on unmount or when turned off', () => {
    const first = walkKeys();
    const second = walkKeys();
    const { rerender, unmount } = renderHook(
      ({ keys }: { keys: QuickReviewKeymap | undefined }) => useQuickReviewKeyboard(keys),
      { initialProps: { keys: first as QuickReviewKeymap | undefined } },
    );
    rerender({ keys: second });
    press('n');
    expect(first.n).not.toHaveBeenCalled();
    expect(second.n).toHaveBeenCalledTimes(1);
    rerender({ keys: undefined });
    press('n');
    expect(second.n).toHaveBeenCalledTimes(1);
    rerender({ keys: second });
    unmount();
    press('n');
    expect(second.n).toHaveBeenCalledTimes(1);
  });
});
