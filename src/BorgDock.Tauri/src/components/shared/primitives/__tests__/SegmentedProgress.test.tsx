import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SegmentedProgress } from '../SegmentedProgress';

describe('SegmentedProgress', () => {
  it('renders an ARIA progressbar with passed/total as the value', () => {
    render(<SegmentedProgress passed={8} running={2} total={10} data-testid="bar" />);
    const el = screen.getByTestId('bar');
    expect(el).toHaveAttribute('role', 'progressbar');
    expect(el).toHaveAttribute('aria-valuenow', '8');
    expect(el).toHaveAttribute('aria-valuemin', '0');
    expect(el).toHaveAttribute('aria-valuemax', '10');
  });

  it('sizes the passed segment to passed/total %', () => {
    render(<SegmentedProgress passed={4} running={0} total={10} data-testid="bar" />);
    const passed = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('[data-segment="passed"]');
    expect(passed).not.toBeNull();
    expect(passed!.style.width).toBe('40%');
  });

  it('sizes the running segment with diagonal stripes when running > 0', () => {
    render(<SegmentedProgress passed={4} running={2} total={10} data-testid="bar" />);
    const running = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('[data-segment="running"]');
    expect(running).not.toBeNull();
    expect(running!.style.width).toBe('20%');
    expect(running!.style.left).toBe('40%');
    expect(running!.style.animationName).toBe('bd-stripe-march');
  });

  it('omits the running segment entirely when running is 0', () => {
    render(<SegmentedProgress passed={10} running={0} total={10} data-testid="bar" />);
    const running = screen
      .getByTestId('bar')
      .querySelector('[data-segment="running"]');
    expect(running).toBeNull();
  });

  it('clamps when passed + running exceeds total', () => {
    render(<SegmentedProgress passed={8} running={5} total={10} data-testid="bar" />);
    const passed = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('[data-segment="passed"]');
    const running = screen
      .getByTestId('bar')
      .querySelector<HTMLDivElement>('[data-segment="running"]');
    expect(passed!.style.width).toBe('80%');
    expect(running!.style.width).toBe('20%');
  });

  it('renders nothing crazy when total is 0', () => {
    render(<SegmentedProgress passed={0} running={0} total={0} data-testid="bar" />);
    const el = screen.getByTestId('bar');
    expect(el).toHaveAttribute('aria-valuenow', '0');
    expect(el).toHaveAttribute('aria-valuemax', '0');
  });
});
