import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from '../TextInput';

describe('TextInput', () => {
  it('renders mono font when mono prop set', () => {
    render(<TextInput value="abc" onChange={() => {}} mono ariaLabel="X" />);
    expect(screen.getByRole('textbox').className).toMatch(/font-mono/);
  });

  it('does not have mono class when mono is false', () => {
    render(<TextInput value="abc" onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByRole('textbox').className).not.toMatch(/font-mono/);
  });

  it('renders suffix node', () => {
    render(<TextInput value="abc" onChange={() => {}} suffix={<span>$</span>} ariaLabel="X" />);
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('forwards onChange events', () => {
    const onChange = vi.fn();
    render(<TextInput value="abc" onChange={onChange} ariaLabel="X" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'def' } });
    expect(onChange).toHaveBeenCalledWith('def');
  });
});
