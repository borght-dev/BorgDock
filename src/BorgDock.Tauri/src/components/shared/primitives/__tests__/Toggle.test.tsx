import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('reflects on state via aria-checked', () => {
    render(<Toggle on={true} onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('reflects off state via aria-checked', () => {
    render(<Toggle on={false} onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the inverted value when clicked', () => {
    const onChange = vi.fn();
    render(<Toggle on={false} onChange={onChange} ariaLabel="X" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Toggle on={false} onChange={onChange} disabled ariaLabel="X" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
