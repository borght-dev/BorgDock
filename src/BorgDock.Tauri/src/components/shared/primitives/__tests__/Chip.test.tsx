import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders a <button class="bd-pill">', () => {
    render(<Chip>All</Chip>);
    const el = screen.getByRole('button', { name: /all/i });
    expect(el).toHaveClass('bd-pill');
  });

  it('inactive chips get the ghost pill tone', () => {
    render(<Chip>All</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--ghost');
  });

  it('active chips get the neutral pill tone', () => {
    render(<Chip active>All</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--neutral');
  });

  it('active + tone=error maps to the error pill tone', () => {
    render(
      <Chip active tone="error">
        Failed
      </Chip>,
    );
    expect(screen.getByRole('button')).toHaveClass('bd-pill--error');
  });

  it('inactive + tone=error still renders ghost (tone only kicks in when active)', () => {
    render(<Chip tone="error">Failed</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bd-pill--ghost');
  });

  it('renders the count when provided', () => {
    render(<Chip count={7}>Mine</Chip>);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('omits the count when undefined', () => {
    render(<Chip>All</Chip>);
    expect(screen.getByRole('button').querySelector('.bd-chip__count')).toBeNull();
  });

  it('shows count=0 (zero is a meaningful value)', () => {
    render(<Chip count={0}>Empty</Chip>);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>All</Chip>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has aria-pressed reflecting active state', () => {
    render(<Chip active>All</Chip>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
