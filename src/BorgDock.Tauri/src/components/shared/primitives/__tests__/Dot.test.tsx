import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dot } from '../Dot';

describe('Dot', () => {
  it('renders a bd-dot span', () => {
    render(<Dot tone="green" data-testid="d" />);
    const el = screen.getByTestId('d');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('bd-dot');
  });

  it.each([
    ['green', 'bd-dot--green'],
    ['red', 'bd-dot--red'],
    ['yellow', 'bd-dot--yellow'],
    ['gray', 'bd-dot--gray'],
    ['merged', 'bd-dot--merged'],
  ] as const)('applies %s tone class', (tone, expected) => {
    render(<Dot tone={tone} data-testid="d" />);
    expect(screen.getByTestId('d')).toHaveClass(expected);
  });

  it('defaults to an 8px square', () => {
    render(<Dot tone="gray" data-testid="d" />);
    const style = screen.getByTestId('d').style;
    expect(style.width).toBe('8px');
    expect(style.height).toBe('8px');
  });

  it('respects a custom size', () => {
    render(<Dot tone="gray" size={12} data-testid="d" />);
    const style = screen.getByTestId('d').style;
    expect(style.width).toBe('12px');
    expect(style.height).toBe('12px');
  });

  it('animates when pulse is true', () => {
    render(<Dot tone="green" pulse data-testid="d" />);
    expect(screen.getByTestId('d').style.animation).toContain('bd-pulse-dot');
  });

  it('does not animate when pulse is false', () => {
    render(<Dot tone="green" data-testid="d" />);
    expect(screen.getByTestId('d').style.animation).toBe('');
  });
});
