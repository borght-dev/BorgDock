import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  it('toggles via click', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="X" />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders label and hint', () => {
    render(<Checkbox checked label="Theme" hint="Light or dark" onChange={() => {}} />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Light or dark')).toBeInTheDocument();
  });
});
