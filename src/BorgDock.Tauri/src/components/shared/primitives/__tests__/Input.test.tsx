import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '../Input';

describe('Input', () => {
  it('renders a bd-input wrapper containing an <input>', () => {
    render(<Input placeholder="Search" />);
    const input = screen.getByPlaceholderText('Search');
    expect(input.tagName).toBe('INPUT');
    expect(input.parentElement).toHaveClass('bd-input');
  });

  it('renders leading adornment when provided', () => {
    render(<Input placeholder="x" leading={<span data-testid="lead" />} />);
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('lead').parentElement).toHaveClass('bd-input__adornment');
  });

  it('renders trailing adornment when provided', () => {
    render(<Input placeholder="x" trailing={<span data-testid="trail" />} />);
    expect(screen.getByTestId('trail').parentElement).toHaveClass('bd-input__adornment');
  });

  it('forwards input-level props (type, onChange, value)', () => {
    const onChange = vi.fn();
    render(<Input type="search" value="hi" onChange={onChange} />);
    const input = screen.getByDisplayValue('hi') as HTMLInputElement;
    expect(input.type).toBe('search');
    fireEvent.change(input, { target: { value: 'ho' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards className onto the wrapper, not the input', () => {
    render(<Input className="extra" placeholder="x" />);
    const input = screen.getByPlaceholderText('x');
    expect(input).not.toHaveClass('extra');
    expect(input.parentElement).toHaveClass('extra');
  });
});
