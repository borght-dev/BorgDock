import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useQuickReviewKeyboard } from '../useQuickReviewKeyboard';

afterEach(cleanup);
beforeEach(() => useQuickReviewStore.setState({ state: 'reviewing' }));
describe('Quick review keyboard', () => {
  it('navigates files without approving or skipping a PR', () => {
    const actions = { next: vi.fn(), previous: vi.fn(), markReviewed: vi.fn() };
    renderHook(() => useQuickReviewKeyboard(actions));
    for (const key of ['n', 'p', 'v', 'a', 's', 'ArrowRight'])
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(actions.markReviewed).toHaveBeenCalledTimes(1);
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
  });
  it('ignores typing, modified shortcuts, and submissions', () => {
    const actions = { next: vi.fn(), previous: vi.fn(), markReviewed: vi.fn() };
    renderHook(() => useQuickReviewKeyboard(actions));
    const input = document.createElement('textarea');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    input.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));
    useQuickReviewStore.setState({ state: 'submitting' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(actions.next).not.toHaveBeenCalled();
  });
  it('closes with Escape and unregisters on unmount', () => {
    const actions = { next: vi.fn(), previous: vi.fn(), markReviewed: vi.fn() };
    const { unmount } = renderHook(() => useQuickReviewKeyboard(actions));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(useQuickReviewStore.getState().state).toBe('idle');
    unmount();
    useQuickReviewStore.setState({ state: 'reviewing' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(actions.next).not.toHaveBeenCalled();
  });
});
