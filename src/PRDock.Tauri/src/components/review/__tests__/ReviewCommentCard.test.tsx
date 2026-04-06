import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewCommentCard } from '../ReviewCommentCard';
import type { ClaudeReviewComment } from '@/types';

// Mock react-markdown since it can cause issues in jsdom
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: {},
}));

const makeComment = (overrides: Partial<ClaudeReviewComment> = {}): ClaudeReviewComment => ({
  id: '1',
  author: 'claude',
  body: 'This is a review comment',
  severity: 'suggestion',
  createdAt: '2024-01-01T00:00:00Z',
  htmlUrl: 'https://github.com/pr/1',
  ...overrides,
});

describe('ReviewCommentCard', () => {
  it('renders the comment body via markdown', () => {
    render(<ReviewCommentCard comment={makeComment({ body: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('renders file path when present', () => {
    render(
      <ReviewCommentCard
        comment={makeComment({ filePath: 'src/app.ts', lineNumber: 42 })}
      />,
    );
    expect(screen.getByText('src/app.ts:42')).toBeDefined();
  });

  it('renders file path without line number when lineNumber is undefined', () => {
    render(
      <ReviewCommentCard
        comment={makeComment({ filePath: 'src/app.ts', lineNumber: undefined })}
      />,
    );
    expect(screen.getByText('src/app.ts')).toBeDefined();
  });

  it('does not render file path when filePath is undefined', () => {
    const { container } = render(
      <ReviewCommentCard comment={makeComment({ filePath: undefined })} />,
    );
    // No file path element should exist
    const codeElements = container.querySelectorAll('p[class*="font-"]');
    // The file path <p> should not be present when filePath is undefined
    const filePathTexts = Array.from(codeElements).filter((el) =>
      el.textContent?.includes('.ts'),
    );
    expect(filePathTexts).toHaveLength(0);
  });

  it('renders severity dot for critical comments', () => {
    const { container } = render(
      <ReviewCommentCard comment={makeComment({ severity: 'critical' })} />,
    );
    const dot = container.querySelector('span[style*="background"]');
    expect(dot).toBeDefined();
    expect(dot?.getAttribute('style')).toContain('var(--color-status-red)');
  });

  it('renders severity dot for suggestion comments', () => {
    const { container } = render(
      <ReviewCommentCard comment={makeComment({ severity: 'suggestion' })} />,
    );
    const dot = container.querySelector('span[style*="background"]');
    expect(dot?.getAttribute('style')).toContain('var(--color-purple)');
  });

  it('renders severity dot for praise comments', () => {
    const { container } = render(
      <ReviewCommentCard comment={makeComment({ severity: 'praise' })} />,
    );
    const dot = container.querySelector('span[style*="background"]');
    expect(dot?.getAttribute('style')).toContain('var(--color-status-green)');
  });

  it('renders severity dot for unknown severity', () => {
    const { container } = render(
      <ReviewCommentCard comment={makeComment({ severity: 'unknown' })} />,
    );
    const dot = container.querySelector('span[style*="background"]');
    expect(dot?.getAttribute('style')).toContain('var(--color-status-gray)');
  });

  it('renders the markdown body container', () => {
    render(<ReviewCommentCard comment={makeComment()} />);
    expect(screen.getByTestId('markdown')).toBeDefined();
  });
});
