import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewSlaIndicator } from '../ReviewSlaIndicator';

afterEach(cleanup);

describe('ReviewSlaIndicator', () => {
  it('renders the wait time text', () => {
    render(<ReviewSlaIndicator tier="fresh" waitTime="<1h" />);
    expect(screen.getByText('<1h')).toBeInTheDocument();
  });

  it('shows "Requested recently" as title for fresh tier', () => {
    const { container } = render(<ReviewSlaIndicator tier="fresh" waitTime="2h" />);
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('Requested recently');
  });

  it('shows "Waiting for review" as title for aging tier', () => {
    const { container } = render(<ReviewSlaIndicator tier="aging" waitTime="8h" />);
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('Waiting for review');
  });

  it('shows "Urgent -- review overdue" as title for stale tier', () => {
    const { container } = render(<ReviewSlaIndicator tier="stale" waitTime="2d" />);
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toContain('Urgent');
  });

  it('renders a status dot element for each tier', () => {
    const { container: freshContainer } = render(
      <ReviewSlaIndicator tier="fresh" waitTime="<1h" />,
    );
    expect(freshContainer.querySelector('.rounded-full')).toBeInTheDocument();

    const { container: agingContainer } = render(<ReviewSlaIndicator tier="aging" waitTime="6h" />);
    expect(agingContainer.querySelector('.rounded-full')).toBeInTheDocument();

    const { container: staleContainer } = render(<ReviewSlaIndicator tier="stale" waitTime="3d" />);
    expect(staleContainer.querySelector('.rounded-full')).toBeInTheDocument();
  });

  it('applies animate-pulse class for aging tier dot', () => {
    const { container } = render(<ReviewSlaIndicator tier="aging" waitTime="8h" />);
    const dot = container.querySelector('span > span:first-child');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('applies animate-pulse class for stale tier dot', () => {
    const { container } = render(<ReviewSlaIndicator tier="stale" waitTime="2d" />);
    const dot = container.querySelector('span > span:first-child');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('does not apply animate-pulse for fresh tier dot', () => {
    const { container } = render(<ReviewSlaIndicator tier="fresh" waitTime="<1h" />);
    const dot = container.querySelector('span > span:first-child');
    expect(dot?.className).not.toContain('animate-pulse');
  });
});
