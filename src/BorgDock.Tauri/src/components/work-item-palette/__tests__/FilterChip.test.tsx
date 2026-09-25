// src/components/work-item-palette/__tests__/FilterChip.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from '../FilterChip';

describe('FilterChip', () => {
  it('renders children', () => {
    render(<FilterChip onClick={() => {}}>All</FilterChip>);
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<FilterChip onClick={onClick}>All</FilterChip>);
    fireEvent.click(screen.getByText('All'));
    expect(onClick).toHaveBeenCalled();
  });

  it('marks active state via aria-pressed', () => {
    render(
      <FilterChip active onClick={() => {}}>
        Open
      </FilterChip>,
    );
    expect(screen.getByText('Open').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
