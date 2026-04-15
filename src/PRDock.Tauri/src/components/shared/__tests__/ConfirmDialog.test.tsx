import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  afterEach(cleanup);

  const defaultProps = {
    isOpen: true,
    title: 'Delete item?',
    message: 'This action cannot be undone.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete item?')).toBeTruthy();
    expect(screen.getByText('This action cannot be undone.')).toBeTruthy();
  });

  it('uses default button labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('uses custom button labels', () => {
    render(
      <ConfirmDialog {...defaultProps} confirmLabel="Yes, delete" cancelLabel="No, keep it" />,
    );
    expect(screen.getByText('Yes, delete')).toBeTruthy();
    expect(screen.getByText('No, keep it')).toBeTruthy();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    // The overlay is the first child div with fixed inset-0
    const overlay = container.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement;
    fireEvent.click(overlay);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel on Escape when dialog is closed', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('does not call onCancel on non-Escape keys', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('stops propagation on confirm click', () => {
    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <ConfirmDialog {...defaultProps} />
      </div>,
    );
    fireEvent.click(screen.getByText('Confirm'));
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('stops propagation on cancel click', () => {
    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <ConfirmDialog {...defaultProps} />
      </div>,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('stops propagation when clicking inside modal content', () => {
    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <ConfirmDialog {...defaultProps} />
      </div>,
    );
    fireEvent.click(screen.getByText('Delete item?'));
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('applies danger variant styling to confirm button', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-[var(--color-action-danger-bg');
  });

  it('applies default variant styling to confirm button', () => {
    render(<ConfirmDialog {...defaultProps} variant="default" />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-[var(--color-accent)]');
  });

  it('cleans up Escape listener when dialog closes', () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} />);
    rerender(<ConfirmDialog {...defaultProps} isOpen={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });
});
