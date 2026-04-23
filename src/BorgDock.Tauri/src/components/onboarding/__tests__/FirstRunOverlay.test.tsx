import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FirstRunOverlay } from '../FirstRunOverlay';

describe('FirstRunOverlay', () => {
  const defaultProps = {
    message: 'Welcome to BorgDock!',
    ctaLabel: 'Get Started',
    onCtaClick: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('renders the message text', () => {
    render(<FirstRunOverlay {...defaultProps} />);
    expect(screen.getByText('Welcome to BorgDock!')).toBeTruthy();
  });

  it('renders the CTA button with provided label', () => {
    render(<FirstRunOverlay {...defaultProps} />);
    expect(screen.getByText('Get Started')).toBeTruthy();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    const { container } = render(<FirstRunOverlay {...defaultProps} onDismiss={onDismiss} />);
    const closeBtn = container.querySelector('button');
    fireEvent.click(closeBtn!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls both onCtaClick and onDismiss when CTA button is clicked', () => {
    const onCtaClick = vi.fn();
    const onDismiss = vi.fn();
    render(<FirstRunOverlay {...defaultProps} onCtaClick={onCtaClick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders with different message and CTA label', () => {
    render(
      <FirstRunOverlay
        message="New feature available"
        ctaLabel="Try Now"
        onCtaClick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('New feature available')).toBeTruthy();
    expect(screen.getByText('Try Now')).toBeTruthy();
  });
});
