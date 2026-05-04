import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '../Select';

describe('Select', () => {
  it('forwards selected value via onChange', () => {
    const onChange = vi.fn();
    render(<Select value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={onChange} ariaLabel="X" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows label of current value', () => {
    render(<Select value="b" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} onChange={() => {}} ariaLabel="X" />);
    // The visible display span (not the hidden <option>)
    const matches = screen.getAllByText('Beta');
    // One in the <option>, one in the display span — at least one must be a span
    expect(matches.some((el) => el.tagName === 'SPAN')).toBe(true);
  });
});
