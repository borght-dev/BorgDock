import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Card } from '../Card';

describe('Card', () => {
  it('renders children inside a bd-card <div>', () => {
    render(<Card data-testid="c">hi</Card>);
    const el = screen.getByTestId('c');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveClass('bd-card');
    expect(el.textContent).toBe('hi');
  });

  it.each([
    ['sm', 'bd-card--pad-sm'],
    ['md', 'bd-card--pad-md'],
    ['lg', 'bd-card--pad-lg'],
  ] as const)('applies %s padding class', (padding, expected) => {
    render(
      <Card padding={padding} data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c')).toHaveClass(expected);
  });

  it('defaults to medium padding', () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c')).toHaveClass('bd-card--pad-md');
  });

  it('adds bd-card--own for variant=own', () => {
    render(
      <Card variant="own" data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c')).toHaveClass('bd-card--own');
  });

  it('defaults variant to "default" with no own modifier', () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('bd-card--own');
  });

  it('adds bd-card--interactive and role=button when interactive', () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick} data-testid="c">
        x
      </Card>,
    );
    const el = screen.getByTestId('c');
    expect(el).toHaveClass('bd-card--interactive');
    expect(el).toHaveAttribute('role', 'button');
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('fires onClick when the interactive card is clicked', () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick} data-testid="c">
        x
      </Card>,
    );
    fireEvent.click(screen.getByTestId('c'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not expose a button role when non-interactive', () => {
    render(<Card data-testid="c">x</Card>);
    const el = screen.getByTestId('c');
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('tabindex');
  });
});
