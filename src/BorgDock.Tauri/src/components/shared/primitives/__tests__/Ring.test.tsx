import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Ring } from '../Ring';

describe('Ring', () => {
  it('renders a bd-ring wrapper with --ring-size custom property', () => {
    render(<Ring value={75} data-testid="ring" />);
    const el = screen.getByTestId('ring');
    expect(el).toHaveClass('bd-ring');
    expect(el.style.getPropertyValue('--ring-size')).toBe('28px');
  });

  it('honours a custom size', () => {
    render(<Ring value={50} size={40} data-testid="ring" />);
    expect(screen.getByTestId('ring').style.getPropertyValue('--ring-size')).toBe('40px');
  });

  it('clamps value to the 0..100 range for the dash offset', () => {
    const { rerender } = render(<Ring value={-10} data-testid="ring" />);
    const low = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    expect(low).not.toBeNull();
    const offLow = Number(low!.getAttribute('stroke-dashoffset'));
    rerender(<Ring value={200} data-testid="ring" />);
    const high = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    const offHigh = Number(high!.getAttribute('stroke-dashoffset'));
    // -10 clamps to 0 (full offset), 200 clamps to 100 (zero offset)
    expect(offLow).toBeGreaterThan(offHigh);
    expect(offHigh).toBeCloseTo(0, 5);
  });

  it('renders the label by default', () => {
    render(<Ring value={82} />);
    expect(screen.getByText('82')).toBeInTheDocument();
  });

  it('hides the label when label={false}', () => {
    render(<Ring value={82} label={false} data-testid="ring" />);
    expect(screen.getByTestId('ring').querySelector('.bd-ring__label')).toBeNull();
  });

  it.each([
    [95, 'var(--color-status-green)'],
    [80, 'var(--color-status-green)'],
    [79, 'var(--color-status-yellow)'],
    [50, 'var(--color-status-yellow)'],
    [49, 'var(--color-status-red)'],
    [0, 'var(--color-status-red)'],
  ] as const)('applies correct stroke colour for value=%s', (value, expected) => {
    render(<Ring value={value} data-testid="ring" />);
    const arc = screen
      .getByTestId('ring')
      .querySelector<SVGCircleElement>('.bd-ring__value');
    expect(arc!.getAttribute('stroke')).toBe(expected);
  });
});
