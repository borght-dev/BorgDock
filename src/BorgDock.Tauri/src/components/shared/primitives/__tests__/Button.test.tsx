import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';

describe('Button', () => {
  it('renders a <button> with bd-btn root class', () => {
    render(<Button variant="primary" size="md">Click me</Button>);
    const el = screen.getByRole('button', { name: 'Click me' });
    expect(el).toHaveClass('bd-btn');
  });

  it.each([
    ['primary', 'bd-btn--primary'],
    ['danger', 'bd-btn--danger'],
    ['ghost', 'bd-btn--ghost'],
  ] as const)('applies %s variant class', (variant, expected) => {
    render(<Button variant={variant} size="md">x</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('secondary variant adds no variant modifier class', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bd-btn');
    expect(cls).not.toContain('bd-btn--primary');
    expect(cls).not.toContain('bd-btn--danger');
    expect(cls).not.toContain('bd-btn--ghost');
  });

  it.each([
    ['sm', 'bd-btn--sm'],
    ['lg', 'bd-btn--lg'],
  ] as const)('applies %s size class', (size, expected) => {
    render(<Button variant="secondary" size={size}>x</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('medium size adds no size modifier class', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).not.toContain('bd-btn--sm');
    expect(cls).not.toContain('bd-btn--lg');
  });

  it('renders leading + trailing adornments', () => {
    render(
      <Button
        variant="secondary"
        size="md"
        leading={<span data-testid="lead" />}
        trailing={<span data-testid="trail" />}
      >
        x
      </Button>,
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('replaces leading with a spinner when loading', () => {
    render(
      <Button
        variant="primary"
        size="md"
        loading
        leading={<span data-testid="lead" />}
      >
        Save
      </Button>,
    );
    expect(screen.queryByTestId('lead')).not.toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('.bd-btn__spinner')).not.toBeNull();
  });

  it('is disabled when loading is true', () => {
    render(<Button variant="primary" size="md" loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="md" onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="md" disabled onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults type to "button"', () => {
    render(<Button variant="secondary" size="md">x</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('allows overriding type for form submits', () => {
    render(
      <Button variant="primary" size="md" type="submit">
        Save
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
