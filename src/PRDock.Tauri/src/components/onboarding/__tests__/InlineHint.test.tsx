import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { InlineHint } from '../InlineHint';
import { useOnboardingStore } from '@/stores/onboarding-store';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

describe('InlineHint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOnboardingStore.setState({
      dismissedHints: new Set(),
      dismissHint: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the hint text', () => {
    render(<InlineHint hintId="focus-priority-ranking" text="This is a hint" />);
    expect(screen.getByText('This is a hint')).toBeTruthy();
  });

  it('returns null when hint is already dismissed', () => {
    useOnboardingStore.setState({
      dismissedHints: new Set(['focus-priority-ranking'] as const),
    });
    const { container } = render(
      <InlineHint hintId="focus-priority-ranking" text="Hint text" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders as a clickable button', () => {
    render(<InlineHint hintId="focus-priority-ranking" text="Click me" />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('starts fading and dismisses on click', () => {
    const dismissHint = vi.fn();
    useOnboardingStore.setState({
      dismissedHints: new Set(),
      dismissHint,
    });

    render(<InlineHint hintId="focus-priority-ranking" text="Click to dismiss" />);
    fireEvent.click(screen.getByRole('button'));

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(dismissHint).toHaveBeenCalledWith('focus-priority-ranking');
  });

  it('auto-dismisses after timeoutMs (default 10000)', () => {
    const dismissHint = vi.fn();
    useOnboardingStore.setState({
      dismissedHints: new Set(),
      dismissHint,
    });

    render(<InlineHint hintId="pr-summary-generate" text="Auto dismiss" />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(dismissHint).toHaveBeenCalledWith('pr-summary-generate');
  });

  it('auto-dismisses after custom timeoutMs', () => {
    const dismissHint = vi.fn();
    useOnboardingStore.setState({
      dismissedHints: new Set(),
      dismissHint,
    });

    render(
      <InlineHint
        hintId="review-mode-shortcuts"
        text="Fast hint"
        timeoutMs={3000}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(dismissHint).toHaveBeenCalledWith('review-mode-shortcuts');
  });

  it('does not set auto-dismiss timer when already dismissed', () => {
    useOnboardingStore.setState({
      dismissedHints: new Set(['focus-priority-ranking'] as const),
    });

    const { container } = render(
      <InlineHint hintId="focus-priority-ranking" text="Should not show" />,
    );
    expect(container.innerHTML).toBe('');
  });
});
