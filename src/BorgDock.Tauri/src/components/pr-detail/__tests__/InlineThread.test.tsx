import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineThread } from '../InlineThread';
import type { ReviewThread } from '@/types';

const T = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't1',
  filePath: 'a.ts',
  line: 12,
  isResolved: false,
  snippet: [],
  comments: [
    {
      id: 'c1',
      databaseId: 1,
      author: 'reviewer',
      authorIsBot: false,
      body: 'rename plz',
      createdAt: '2026-05-01T00:00:00Z',
    },
  ],
  ...over,
});

describe('InlineThread', () => {
  it('renders the thread comments', () => {
    render(<InlineThread thread={T()} onClose={vi.fn()} />);
    expect(screen.getByText(/rename plz/i)).toBeInTheDocument();
  });

  it('Reply opens an editor', () => {
    render(<InlineThread thread={T()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByPlaceholderText(/reply.../i)).toBeInTheDocument();
  });

  it('Resolve calls onResolve', () => {
    const onResolve = vi.fn();
    render(<InlineThread thread={T()} onClose={vi.fn()} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    expect(onResolve).toHaveBeenCalledWith('t1');
  });

  it('Close button calls onClose', () => {
    const onClose = vi.fn();
    render(<InlineThread thread={T()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
