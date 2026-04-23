import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffHunk, DiffLine, HighlightSpan } from '@/types';
import { UnifiedDiffView } from '../UnifiedDiffView';

vi.mock('@/services/diff-parser', () => ({
  findLinePairs: vi.fn(() => new Map()),
  computeInlineChanges: vi.fn(() => null),
}));

vi.mock('@/services/syntax-highlighter', () => ({
  getHighlightClass: (category: string) => `--color-syntax-${category}`,
}));

function makeLine(overrides: Partial<DiffLine> = {}): DiffLine {
  return {
    type: 'context',
    content: 'context line',
    oldLineNumber: 1,
    newLineNumber: 1,
    ...overrides,
  };
}

function makeHunk(lines: DiffLine[], header = '@@ -1,3 +1,3 @@ function'): DiffHunk {
  return {
    header,
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 3,
    lines,
  };
}

describe('UnifiedDiffView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a table element', () => {
    const hunks = [makeHunk([makeLine()])];
    const { container } = render(<UnifiedDiffView hunks={hunks} />);
    expect(container.querySelector('table')).toBeDefined();
  });

  it('renders context lines with both line numbers', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'const a = 1;', oldLineNumber: 5, newLineNumber: 5 },
    ];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('5');
    expect(cells[1]?.textContent).toBe('5');
  });

  it('renders added lines with + prefix and only new line number', () => {
    const lines: DiffLine[] = [{ type: 'add', content: 'new line', newLineNumber: 10 }];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    // Old line number should be empty
    expect(cells[0]?.textContent).toBe('');
    // New line number
    expect(cells[1]?.textContent).toBe('10');
    // Content cell should contain + prefix
    expect(cells[2]?.textContent).toContain('+');
  });

  it('renders deleted lines with - prefix and only old line number', () => {
    const lines: DiffLine[] = [{ type: 'delete', content: 'old line', oldLineNumber: 7 }];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('7');
    expect(cells[1]?.textContent).toBe('');
  });

  it('renders hunk headers spanning full width', () => {
    const lines: DiffLine[] = [{ type: 'hunk-header', content: '@@ -1,3 +1,3 @@ function test()' }];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const td = container.querySelector('td[colspan="3"]');
    expect(td).not.toBeNull();
    expect(td?.textContent).toContain('@@ -1,3 +1,3 @@ function test()');
  });

  it('renders context line prefix as space', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'same', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const contentCell = container.querySelectorAll('td')[2];
    const prefixSpan = contentCell?.querySelector('span');
    expect(prefixSpan?.textContent?.trim()).toBe('');
  });

  it('renders multiple hunks sequentially', () => {
    const hunk1 = makeHunk([
      { type: 'context', content: 'line1', oldLineNumber: 1, newLineNumber: 1 },
    ]);
    const hunk2 = makeHunk([
      { type: 'context', content: 'line2', oldLineNumber: 10, newLineNumber: 10 },
    ]);
    const { container } = render(<UnifiedDiffView hunks={[hunk1, hunk2]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(2);
  });

  it('applies correct background colors for line types', () => {
    const lines: DiffLine[] = [
      { type: 'add', content: 'added', newLineNumber: 1 },
      { type: 'delete', content: 'deleted', oldLineNumber: 1 },
      { type: 'context', content: 'ctx', oldLineNumber: 2, newLineNumber: 2 },
    ];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');

    expect(rows[0]?.getAttribute('style')).toContain('var(--color-diff-added-bg)');
    expect(rows[1]?.getAttribute('style')).toContain('var(--color-diff-deleted-bg)');
    expect(rows[2]?.getAttribute('style')).toContain('var(--color-diff-context-bg)');
  });

  it('applies gutter background colors', () => {
    const lines: DiffLine[] = [
      { type: 'add', content: 'added', newLineNumber: 1 },
      { type: 'delete', content: 'deleted', oldLineNumber: 1 },
    ];
    const { container } = render(<UnifiedDiffView hunks={[makeHunk(lines)]} />);
    const gutterCells = container.querySelectorAll('td:first-child');
    expect(gutterCells[0]?.getAttribute('style')).toContain('var(--color-diff-added-gutter-bg)');
    expect(gutterCells[1]?.getAttribute('style')).toContain('var(--color-diff-deleted-gutter-bg)');
  });

  it('renders empty hunks without error', () => {
    const { container } = render(<UnifiedDiffView hunks={[]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(0);
  });

  it('passes syntax highlights to DiffLineContent', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'const x', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const highlights = new Map<number, HighlightSpan[]>();
    highlights.set(0, [{ start: 0, end: 5, category: 'keyword' }]);

    const { container } = render(
      <UnifiedDiffView hunks={[makeHunk(lines)]} syntaxHighlights={highlights} />,
    );
    // The syntax highlighting produces a span with a style attribute for the keyword
    const highlighted = container.querySelector('span[style*="--color-syntax-keyword"]');
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toBe('const');
  });

  it('handles null syntaxHighlights gracefully', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'hello', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const { container } = render(
      <UnifiedDiffView hunks={[makeHunk(lines)]} syntaxHighlights={null} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
  });
});
