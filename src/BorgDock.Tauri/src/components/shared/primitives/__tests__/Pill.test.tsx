import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pill } from '../Pill';

describe('Pill', () => {
  it('renders children inside a bd-pill root', () => {
    render(<Pill tone="neutral">Open</Pill>);
    const el = screen.getByText('Open');
    expect(el).toHaveClass('bd-pill');
  });

  it.each([
    ['success', 'bd-pill--success'],
    ['warning', 'bd-pill--warning'],
    ['error', 'bd-pill--error'],
    ['neutral', 'bd-pill--neutral'],
    ['draft', 'bd-pill--draft'],
    ['ghost', 'bd-pill--ghost'],
  ] as const)('applies the correct tone class for %s', (tone, expected) => {
    render(<Pill tone={tone}>x</Pill>);
    expect(screen.getByText('x')).toHaveClass(expected);
  });

  it('renders the leading icon when provided', () => {
    render(
      <Pill tone="success" icon={<span data-testid="icon" />}>
        Merged
      </Pill>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('forwards className alongside tone classes', () => {
    render(
      <Pill tone="neutral" className="extra">
        x
      </Pill>,
    );
    expect(screen.getByText('x')).toHaveClass('extra');
    expect(screen.getByText('x')).toHaveClass('bd-pill--neutral');
  });
});
