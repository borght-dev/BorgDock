import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffHunk, DiffLine, HighlightSpan } from '@/types';
import { SplitDiffView } from '../SplitDiffView';

vi.mock('@/services/diff-parser', () => ({
  findLinePairs: vi.fn(() => new Map()),
  computeInlineChanges: vi.fn(() => null),
}));

vi.mock('@/services/syntax-highlighter', () => ({
  getHighlightClass: (category: string) => `--color-syntax-${category}`,
}));

function makeHunk(lines: DiffLine[], header = '@@ -1,3 +1,3 @@'): DiffHunk {
  return {
    header,
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 3,
    lines,
  };
}

describe('SplitDiffView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a table with 4 columns', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'same', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const cols = container.querySelectorAll('col');
    expect(cols.length).toBe(4);
  });

  it('renders context lines on both sides', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'same line', oldLineNumber: 5, newLineNumber: 5 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    // 4 cells: left gutter, left content, right gutter, right content
    expect(cells.length).toBe(4);
    expect(cells[0]?.textContent).toBe('5');
    expect(cells[2]?.textContent).toBe('5');
  });

  it('renders deleted lines only on the left side', () => {
    const lines: DiffLine[] = [{ type: 'delete', content: 'old line', oldLineNumber: 3 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('3');
    // Right gutter should be empty
    expect(cells[2]?.textContent).toBe('');
  });

  it('renders added lines only on the right side', () => {
    const lines: DiffLine[] = [{ type: 'add', content: 'new line', newLineNumber: 4 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    // Left gutter should be empty
    expect(cells[0]?.textContent).toBe('');
    // Right gutter should have number
    expect(cells[2]?.textContent).toBe('4');
  });

  it('pairs delete+add lines side by side', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'old', oldLineNumber: 1 },
      { type: 'add', content: 'new', newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');
    // Should be 1 row with both sides filled
    expect(rows.length).toBe(1);
    const cells = rows[0]!.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('1');
    expect(cells[2]?.textContent).toBe('1');
  });

  it('handles more deletes than adds', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'del1', oldLineNumber: 1 },
      { type: 'delete', content: 'del2', oldLineNumber: 2 },
      { type: 'add', content: 'add1', newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');
    // 2 rows: first paired, second delete-only
    expect(rows.length).toBe(2);
  });

  it('handles more adds than deletes', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'del1', oldLineNumber: 1 },
      { type: 'add', content: 'add1', newLineNumber: 1 },
      { type: 'add', content: 'add2', newLineNumber: 2 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(2);
  });

  it('renders hunk headers spanning all 4 columns', () => {
    const lines: DiffLine[] = [{ type: 'hunk-header', content: '@@ -1,3 +1,5 @@ module' }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const td = container.querySelector('td[colspan="4"]');
    expect(td).not.toBeNull();
    expect(td?.textContent).toContain('@@ -1,3 +1,5 @@ module');
  });

  it('applies correct background for deleted left side', () => {
    const lines: DiffLine[] = [{ type: 'delete', content: 'removed', oldLineNumber: 1 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const contentCells = container.querySelectorAll('td');
    // Left content cell (index 1) should have deleted bg
    expect(contentCells[1]?.getAttribute('style')).toContain('var(--color-diff-deleted-bg)');
  });

  it('applies correct background for added right side', () => {
    const lines: DiffLine[] = [{ type: 'add', content: 'added', newLineNumber: 1 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const contentCells = container.querySelectorAll('td');
    // Right content cell (index 3) should have added bg
    expect(contentCells[3]?.getAttribute('style')).toContain('var(--color-diff-added-bg)');
  });

  it('renders empty hunks without error', () => {
    const { container } = render(<SplitDiffView hunks={[]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(0);
  });

  it('renders multiple hunks', () => {
    const hunk1 = makeHunk([
      { type: 'context', content: 'line1', oldLineNumber: 1, newLineNumber: 1 },
    ]);
    const hunk2 = makeHunk([
      { type: 'context', content: 'line2', oldLineNumber: 10, newLineNumber: 10 },
    ]);
    const { container } = render(<SplitDiffView hunks={[hunk1, hunk2]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(2);
  });

  it('passes syntax highlights to DiffLineContent', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'const x', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const highlights = new Map<number, HighlightSpan[]>();
    highlights.set(0, [{ start: 0, end: 5, category: 'keyword' }]);

    const { container } = render(
      <SplitDiffView hunks={[makeHunk(lines)]} syntaxHighlights={highlights} />,
    );
    const highlighted = container.querySelectorAll('span[style*="--color-syntax-keyword"]');
    // Both left and right side should show the syntax highlight for context lines
    expect(highlighted.length).toBe(2);
  });

  it('handles null syntaxHighlights', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'hello', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const { container } = render(
      <SplitDiffView hunks={[makeHunk(lines)]} syntaxHighlights={null} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('applies gutter background for deleted lines on left', () => {
    const lines: DiffLine[] = [{ type: 'delete', content: 'removed', oldLineNumber: 2 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const firstGutter = container.querySelector('td');
    expect(firstGutter?.getAttribute('style')).toContain('var(--color-diff-deleted-gutter-bg)');
  });

  it('applies gutter background for added lines on right', () => {
    const lines: DiffLine[] = [{ type: 'add', content: 'added', newLineNumber: 2 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const gutterCells = container.querySelectorAll('td');
    // Right gutter cell (index 2)
    expect(gutterCells[2]?.getAttribute('style')).toContain('var(--color-diff-added-gutter-bg)');
  });

  it('handles standalone add lines (not preceded by delete)', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'before', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'add', content: 'new line 1', newLineNumber: 2 },
      { type: 'add', content: 'new line 2', newLineNumber: 3 },
      { type: 'context', content: 'after', oldLineNumber: 2, newLineNumber: 4 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');
    // context + 2 adds + context = 4 rows
    expect(rows.length).toBe(4);
  });

  it('renders unequal delete/add groups correctly', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'old1', oldLineNumber: 1 },
      { type: 'delete', content: 'old2', oldLineNumber: 2 },
      { type: 'delete', content: 'old3', oldLineNumber: 3 },
      { type: 'add', content: 'new1', newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const rows = container.querySelectorAll('tr');
    // 3 rows: first paired, second delete-only, third delete-only
    expect(rows.length).toBe(3);
  });

  it('handles context line background correctly when left or right is null', () => {
    // When left is null, it should use context bg
    const lines: DiffLine[] = [{ type: 'add', content: 'only right', newLineNumber: 1 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const cells = container.querySelectorAll('td');
    // Left content cell (index 1) should have context bg since left is null
    expect(cells[1]?.getAttribute('style')).toContain('var(--color-diff-context-bg)');
  });

  it('passes original line index for syntax highlights on delete lines', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'const x = 1;', oldLineNumber: 5 },
      { type: 'add', content: 'const x = 2;', newLineNumber: 5 },
    ];
    const highlights = new Map<number, HighlightSpan[]>();
    highlights.set(0, [{ start: 0, end: 5, category: 'keyword' }]);
    highlights.set(1, [{ start: 0, end: 5, category: 'keyword' }]);

    const { container } = render(
      <SplitDiffView hunks={[makeHunk(lines)]} syntaxHighlights={highlights} />,
    );
    const highlighted = container.querySelectorAll('span[style*="--color-syntax-keyword"]');
    expect(highlighted.length).toBe(2);
  });

  it('renders multiple hunks with accumulated offset', () => {
    const hunk1 = makeHunk([
      { type: 'context', content: 'a', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'delete', content: 'b', oldLineNumber: 2 },
    ]);
    const hunk2 = makeHunk([
      { type: 'add', content: 'c', newLineNumber: 10 },
      { type: 'context', content: 'd', oldLineNumber: 11, newLineNumber: 11 },
    ]);
    const { container } = render(<SplitDiffView hunks={[hunk1, hunk2]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(4);
  });

  it('handles empty hunk with no lines', () => {
    const hunk = makeHunk([]);
    const { container } = render(<SplitDiffView hunks={[hunk]} />);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(0);
  });

  it('renders data-line-kind="add" on the right cell of an addition row', () => {
    const lines: DiffLine[] = [{ type: 'add', content: 'new line', newLineNumber: 1 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    expect(container.querySelector('[data-line-kind="add"]')).not.toBeNull();
  });

  it('renders data-line-kind="del" on the left cell of a deletion row', () => {
    const lines: DiffLine[] = [{ type: 'delete', content: 'old line', oldLineNumber: 1 }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    expect(container.querySelector('[data-line-kind="del"]')).not.toBeNull();
  });

  it('renders data-line-kind="context" on both cells of a context row', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'same', oldLineNumber: 1, newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    expect(container.querySelectorAll('[data-line-kind="context"]').length).toBe(2);
  });

  it('renders data-line-kind="del" on left and "add" on right for paired modified row', () => {
    const lines: DiffLine[] = [
      { type: 'delete', content: 'old', oldLineNumber: 1 },
      { type: 'add', content: 'new', newLineNumber: 1 },
    ];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    expect(container.querySelector('[data-line-kind="del"]')).not.toBeNull();
    expect(container.querySelector('[data-line-kind="add"]')).not.toBeNull();
  });

  it('renders data-hunk-header on hunk header rows', () => {
    const lines: DiffLine[] = [{ type: 'hunk-header', content: '@@ -1,3 +1,5 @@ module' }];
    const { container } = render(<SplitDiffView hunks={[makeHunk(lines)]} />);
    const headers = container.querySelectorAll('[data-hunk-header]');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });
});
