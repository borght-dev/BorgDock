import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from '../ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders with role=switch and aria-checked reflecting the prop', () => {
    render(<ToggleSwitch checked={true} onChange={vi.fn()} aria-label="Run at startup" />);
    const sw = screen.getByRole('switch', { name: 'Run at startup' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
  it('calls onChange with the inverted value on click', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} aria-label="x" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} disabled aria-label="x" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('exposes data-checked attribute', () => {
    const { container } = render(<ToggleSwitch checked={true} onChange={vi.fn()} aria-label="x" />);
    expect(container.querySelector('[data-toggle][data-checked="true"]')).toBeInTheDocument();
  });
});
