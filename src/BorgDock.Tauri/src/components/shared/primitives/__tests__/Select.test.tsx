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
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
