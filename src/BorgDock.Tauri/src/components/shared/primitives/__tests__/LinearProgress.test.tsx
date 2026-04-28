import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LinearProgress } from '../LinearProgress';

describe('LinearProgress', () => {
  it('renders a bd-linear container with an ARIA progressbar role', () => {
    render(<LinearProgress value={40} data-testid="bar" />);
    const el = screen.getByTestId('bar');
    expect(el).toHaveClass('bd-linear');
    expect(el).toHaveAttribute('role', 'progressbar');
    expect(el).toHaveAttribute('aria-valuenow', '40');
    expect(el).toHaveAttribute('aria-valuemin', '0');
    expect(el).toHaveAttribute('aria-valuemax', '100');
  });

  it('sets the inner fill width equal to the clamped value%', () => {
    const { rerender } = render(<LinearProgress value={75} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('75%');
    rerender(<LinearProgress value={150} data-testid="bar" />);
    expect(fill!.style.width).toBe('100%');
    rerender(<LinearProgress value={-20} data-testid="bar" />);
    expect(fill!.style.width).toBe('0%');
  });

  it('defaults to accent tone', () => {
    render(<LinearProgress value={10} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).toHaveClass('bd-linear__fill--accent');
  });

  it.each([
    ['success', 'bd-linear__fill--success'],
    ['warning', 'bd-linear__fill--warning'],
    ['error', 'bd-linear__fill--error'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<LinearProgress value={50} tone={tone} data-testid="bar" />);
    const fill = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('.bd-linear__fill');
    expect(fill).toHaveClass(expected);
  });
});
