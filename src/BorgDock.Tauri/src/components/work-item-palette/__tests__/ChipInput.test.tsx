// src/components/work-item-palette/__tests__/ChipInput.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipInput } from '../ChipInput';

describe('ChipInput', () => {
  it('renders the placeholder', () => {
    render(<ChipInput value="" onChange={() => {}} placeholder="Search…" />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('renders chips for parsed operators', () => {
    render(<ChipInput value="state:active fix" onChange={() => {}} />);
    expect(screen.getByText('state:active')).toBeInTheDocument();
  });

  it('renders @mention chips', () => {
    render(<ChipInput value="@me toast" onChange={() => {}} />);
    expect(screen.getByText('@me')).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<ChipInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('calls onChange("") when clear button clicked', () => {
    const onChange = vi.fn();
    render(<ChipInput value="hello" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
