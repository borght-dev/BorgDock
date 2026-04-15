import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { FeatureBadge } from '../FeatureBadge';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

describe('FeatureBadge', () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      dismissedBadges: new Set(),
    });
  });

  it('renders with default "NEW" label', () => {
    render(<FeatureBadge badgeId="focus-mode" />);
    expect(screen.getByText('NEW')).toBeTruthy();
  });

  it('renders with custom label', () => {
    render(<FeatureBadge badgeId="focus-mode" label="BETA" />);
    expect(screen.getByText('BETA')).toBeTruthy();
  });

  it('returns null when badge is already dismissed', () => {
    useOnboardingStore.setState({
      dismissedBadges: new Set(['focus-mode'] as const),
    });
    const { container } = render(<FeatureBadge badgeId="focus-mode" />);
    expect(container.innerHTML).toBe('');
  });

  it('calls dismissBadge and stops propagation on click', () => {
    const dismissBadge = vi.fn();
    useOnboardingStore.setState({
      dismissedBadges: new Set(),
      dismissBadge,
    });

    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <FeatureBadge badgeId="pr-summary" />
      </div>,
    );

    fireEvent.click(screen.getByText('NEW'));
    expect(dismissBadge).toHaveBeenCalledWith('pr-summary');
    // stopPropagation should prevent outer click
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('renders as a button element', () => {
    render(<FeatureBadge badgeId="review-mode" />);
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
