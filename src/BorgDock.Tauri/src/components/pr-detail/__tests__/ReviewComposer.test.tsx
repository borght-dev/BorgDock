import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewComposer } from '../ReviewComposer';

describe('ReviewComposer', () => {
  it('comment mode shows only the textarea + submit/cancel', () => {
    render(<ReviewComposer kind="comment" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByPlaceholderText(/leave a comment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^comment$/i })).toBeInTheDocument();
  });

  it('review mode shows three decision pills', () => {
    render(<ReviewComposer kind="review" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^comment only$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument();
  });

  it('submits with the chosen decision and body in review mode', () => {
    const onSubmit = vi.fn();
    render(<ReviewComposer kind="review" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /request changes/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit request$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'review', decision: 'request', body: 'nope' });
  });

  it('submits with body in comment mode', () => {
    const onSubmit = vi.fn();
    render(<ReviewComposer kind="comment" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'fyi' } });
    fireEvent.click(screen.getByRole('button', { name: /^comment$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'comment', body: 'fyi' });
  });

  it('cancel fires onCancel without submitting', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(<ReviewComposer kind="review" onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
