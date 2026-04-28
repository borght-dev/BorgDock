import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from '../WindowControls';

describe('WindowControls', () => {
  it('renders minimize, maximize, and close buttons by default', () => {
    render(<WindowControls />);
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('fires onMinimize when the minimize button is clicked', () => {
    const onMinimize = vi.fn();
    render(<WindowControls onMinimize={onMinimize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it('fires onMaximize when the maximize button is clicked', () => {
    const onMaximize = vi.fn();
    render(<WindowControls onMaximize={onMaximize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(onMaximize).toHaveBeenCalledOnce();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<WindowControls onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the close button with the destructive variant class', () => {
    render(<WindowControls />);
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('bd-wc--close');
  });

  it('omits a callback silently — button still renders but click is a no-op', () => {
    render(<WindowControls />);
    // Should not throw
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
});
