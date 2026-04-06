import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DiffLineContent } from '../DiffLineContent';
import type { InlineChange, HighlightSpan } from '@/types';

vi.mock('@/services/syntax-highlighter', () => ({
  getHighlightClass: (category: string) => `--color-syntax-${category}`,
}));

describe('DiffLineContent', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders plain text when no inlineChanges or syntaxSpans', () => {
    render(<DiffLineContent content="hello world" />);
    expect(screen.getByText('hello world')).toBeDefined();
  });

  it('renders newline when content is empty', () => {
    const { container } = render(<DiffLineContent content="" />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('\n');
  });

  it('renders inline changes with priority over syntax spans', () => {
    const inlineChanges: InlineChange[] = [
      { type: 'unchanged', text: 'he' },
      { type: 'added', text: 'llo' },
      { type: 'unchanged', text: ' world' },
    ];
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 5, category: 'keyword' },
    ];
    const { container } = render(
      <DiffLineContent
        content="hello world"
        inlineChanges={inlineChanges}
        syntaxSpans={syntaxSpans}
      />,
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(3);
    expect(spans[0]?.textContent).toBe('he');
    expect(spans[1]?.textContent).toBe('llo');
    expect(spans[2]?.textContent).toBe(' world');
    // Verify syntax spans were NOT used (inline changes take priority)
    expect(container.querySelector('span[style*="--color-syntax"]')).toBeNull();
  });

  it('renders added inline changes with highlighted background', () => {
    const inlineChanges: InlineChange[] = [
      { type: 'added', text: 'new text' },
    ];
    const { container } = render(
      <DiffLineContent content="new text" inlineChanges={inlineChanges} />,
    );
    const span = container.querySelector('span[style]');
    expect(span?.getAttribute('style')).toContain('var(--color-diff-added-bg-highlight)');
  });

  it('renders deleted inline changes with highlighted background', () => {
    const inlineChanges: InlineChange[] = [
      { type: 'deleted', text: 'old text' },
    ];
    const { container } = render(
      <DiffLineContent content="old text" inlineChanges={inlineChanges} />,
    );
    const span = container.querySelector('span[style]');
    expect(span?.getAttribute('style')).toContain('var(--color-diff-deleted-bg-highlight)');
  });

  it('renders unchanged inline changes without special styling', () => {
    const inlineChanges: InlineChange[] = [
      { type: 'unchanged', text: 'same' },
    ];
    const { container } = render(
      <DiffLineContent content="same" inlineChanges={inlineChanges} />,
    );
    const spans = container.querySelectorAll('span');
    // The unchanged span should not have inline style with backgroundColor
    const unchangedSpan = Array.from(spans).find((s) => s.textContent === 'same');
    expect(unchangedSpan?.getAttribute('style')).toBeNull();
  });

  it('renders syntax highlighted spans when no inline changes', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 5, category: 'keyword' },
    ];
    const { container } = render(
      <DiffLineContent content="const x = 1" syntaxSpans={syntaxSpans} />,
    );
    const highlighted = container.querySelector('span[style]');
    expect(highlighted?.textContent).toBe('const');
    expect(highlighted?.getAttribute('style')).toContain('--color-syntax-keyword');
  });

  it('renders text before first syntax span as plain', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 5, end: 10, category: 'string' },
    ];
    render(
      <DiffLineContent content="abcde12345rest" syntaxSpans={syntaxSpans} />,
    );
    expect(screen.getByText('abcde')).toBeDefined();
    expect(screen.getByText('12345')).toBeDefined();
  });

  it('renders text after last syntax span as plain', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 3, category: 'type' },
    ];
    const { container } = render(
      <DiffLineContent content="int main" syntaxSpans={syntaxSpans} />,
    );
    const highlighted = container.querySelector('span[style]');
    expect(highlighted?.textContent).toBe('int');
    // The remaining text is rendered as a plain span
    const allSpans = container.querySelectorAll('span');
    const tailSpan = Array.from(allSpans).find((s) => s.textContent === ' main');
    expect(tailSpan).not.toBeUndefined();
  });

  it('renders multiple syntax spans', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 5, category: 'keyword' },
      { start: 6, end: 7, category: 'variable' },
    ];
    const { container } = render(
      <DiffLineContent content="const x = 1" syntaxSpans={syntaxSpans} />,
    );
    const spans = container.querySelectorAll('span[style]');
    expect(spans.length).toBe(2);
    expect(spans[0]?.textContent).toBe('const');
    expect(spans[1]?.textContent).toBe('x');
  });

  it('falls back to plain text with empty syntax spans array', () => {
    render(<DiffLineContent content="plain" syntaxSpans={[]} />);
    expect(screen.getByText('plain')).toBeDefined();
  });

  it('falls back to plain text with empty inline changes array', () => {
    render(<DiffLineContent content="plain" inlineChanges={[]} />);
    expect(screen.getByText('plain')).toBeDefined();
  });

  it('renders mixed inline changes: unchanged + added + deleted', () => {
    const inlineChanges: InlineChange[] = [
      { type: 'unchanged', text: 'a' },
      { type: 'added', text: 'b' },
      { type: 'deleted', text: 'c' },
    ];
    const { container } = render(
      <DiffLineContent content="abc" inlineChanges={inlineChanges} />,
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(3);
  });

  it('handles syntax spans that overlap or exceed content length', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 100, category: 'comment' },
    ];
    render(<DiffLineContent content="short" syntaxSpans={syntaxSpans} />);
    expect(screen.getByText('short')).toBeDefined();
  });

  it('renders empty content with syntax spans as newline', () => {
    const syntaxSpans: HighlightSpan[] = [
      { start: 0, end: 1, category: 'keyword' },
    ];
    const { container } = render(
      <DiffLineContent content="" syntaxSpans={syntaxSpans} />,
    );
    // Should produce the empty fallback since nothing is renderable
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('\n');
  });
});
