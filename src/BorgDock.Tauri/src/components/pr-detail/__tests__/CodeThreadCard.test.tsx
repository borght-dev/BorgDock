import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeThreadCard } from '../CodeThreadCard';
import type { ReviewThread } from '@/types';

const T = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't1',
  filePath: 'src/components/orders/DivideProjectModal.tsx',
  line: 237,
  isResolved: false,
  snippet: [
    { lineNumber: 235, marker: ' ', text: '  default', isAnchor: false },
    { lineNumber: 236, marker: ' ', text: '  // standalone', isAnchor: false },
    { lineNumber: 237, marker: '+', text: '  size="datetime-trigger"', isAnchor: true },
    { lineNumber: 238, marker: '+', text: '  testId="x"', isAnchor: false },
  ],
  comments: [
    {
      id: 'c1',
      databaseId: 1,
      author: 'claude[bot]',
      authorIsBot: true,
      body: 'leaky abstraction',
      createdAt: '2026-05-01T00:00:00Z',
      severity: 'suggestion',
    },
  ],
  ...over,
});

describe('CodeThreadCard', () => {
  it('renders the file:line header and snippet', () => {
    render(<CodeThreadCard thread={T()} onJumpToFile={vi.fn()} />);
    expect(screen.getByText(/DivideProjectModal\.tsx/)).toBeInTheDocument();
    expect(screen.getByText(/:237/)).toBeInTheDocument();
    expect(screen.getByText(/size="datetime-trigger"/)).toBeInTheDocument();
  });

  it('fires onJumpToFile when "View in Files" is clicked', () => {
    const cb = vi.fn();
    render(<CodeThreadCard thread={T()} onJumpToFile={cb} />);
    fireEvent.click(screen.getByRole('button', { name: /view in files/i }));
    expect(cb).toHaveBeenCalledWith({
      filePath: 'src/components/orders/DivideProjectModal.tsx',
      line: 237,
      threadId: 't1',
    });
  });

  it('resolved thread renders collapsed by default with reply count + first preview', () => {
    render(<CodeThreadCard thread={T({ isResolved: true })} onJumpToFile={vi.fn()} />);
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/leaky abstraction/i)).toBeInTheDocument();
  });

  it('clicking the collapsed resolved row expands it', () => {
    render(<CodeThreadCard thread={T({ isResolved: true })} onJumpToFile={vi.fn()} />);
    expect(screen.queryByText(/size="datetime-trigger"/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /resolved/i }));
    expect(screen.getByText(/size="datetime-trigger"/)).toBeInTheDocument();
  });

  it('shows a reply textarea when "Reply" is clicked', () => {
    render(<CodeThreadCard thread={T()} onJumpToFile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByPlaceholderText(/write a reply/i)).toBeInTheDocument();
  });

  it('calls onResolve when the Resolve thread button is clicked', () => {
    const onResolve = vi.fn();
    render(<CodeThreadCard thread={T()} onJumpToFile={vi.fn()} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /resolve thread/i }));
    expect(onResolve).toHaveBeenCalledWith('t1');
  });
});
