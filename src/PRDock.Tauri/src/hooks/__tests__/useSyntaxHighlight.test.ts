import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSyntaxHighlight } from '../useSyntaxHighlight';
import type { DiffHunk, HighlightSpan } from '@/types';

vi.mock('@/services/syntax-highlighter', () => ({
  highlightLines: vi.fn(),
}));

import { highlightLines } from '@/services/syntax-highlighter';

const mockHighlightLines = vi.mocked(highlightLines);

function makeHunk(lines: Array<{ type: 'add' | 'delete' | 'context' | 'hunk-header'; content: string }>): DiffHunk {
  return {
    header: '@@ -1,3 +1,3 @@',
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 3,
    lines,
  };
}

describe('useSyntaxHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null initially', () => {
    mockHighlightLines.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() =>
      useSyntaxHighlight('test.ts', [makeHunk([{ type: 'context', content: 'const x = 1;' }])]),
    );
    expect(result.current).toBeNull();
  });

  it('returns highlights after async resolution', async () => {
    const spans: HighlightSpan[] = [{ start: 0, end: 5, category: 'keyword' }];
    const resultMap = new Map<number, HighlightSpan[]>();
    resultMap.set(0, spans);
    mockHighlightLines.mockResolvedValue(resultMap);

    const hunks = [makeHunk([{ type: 'context', content: 'const x = 1;' }])];
    const { result } = renderHook(() => useSyntaxHighlight('test.ts', hunks));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.size).toBe(1);
    // The diff index for the first non-hunk-header line should be 0
    expect(result.current!.get(0)).toEqual(spans);
  });

  it('skips hunk-header lines in index mapping', async () => {
    const spans: HighlightSpan[] = [{ start: 0, end: 3, category: 'string' }];
    const resultMap = new Map<number, HighlightSpan[]>();
    resultMap.set(0, spans);
    mockHighlightLines.mockResolvedValue(resultMap);

    const hunks = [
      makeHunk([
        { type: 'hunk-header', content: '@@ -1,3 +1,3 @@' },
        { type: 'context', content: 'foo' },
      ]),
    ];

    const { result } = renderHook(() => useSyntaxHighlight('test.ts', hunks));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // hunk-header is index 0, context is index 1 in diff
    // source index is 0, so result.get(1) should have the spans
    expect(result.current!.get(1)).toEqual(spans);
    expect(result.current!.has(0)).toBe(false);
  });

  it('handles multiple lines across hunks', async () => {
    const spans0: HighlightSpan[] = [{ start: 0, end: 3, category: 'keyword' }];
    const spans1: HighlightSpan[] = [{ start: 0, end: 5, category: 'string' }];
    const resultMap = new Map<number, HighlightSpan[]>();
    resultMap.set(0, spans0);
    resultMap.set(1, spans1);
    mockHighlightLines.mockResolvedValue(resultMap);

    const hunks = [
      makeHunk([
        { type: 'add', content: 'let a;' },
        { type: 'delete', content: 'let b;' },
      ]),
    ];

    const { result } = renderHook(() => useSyntaxHighlight('test.ts', hunks));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current!.get(0)).toEqual(spans0);
    expect(result.current!.get(1)).toEqual(spans1);
  });

  it('does nothing when hunks have no lines', () => {
    const hunks: DiffHunk[] = [makeHunk([])];
    renderHook(() => useSyntaxHighlight('test.ts', hunks));
    expect(mockHighlightLines).not.toHaveBeenCalled();
  });

  it('does nothing when all lines are hunk-headers', () => {
    const hunks = [makeHunk([{ type: 'hunk-header', content: '@@ -1,3 +1,3 @@' }])];
    renderHook(() => useSyntaxHighlight('test.ts', hunks));
    expect(mockHighlightLines).not.toHaveBeenCalled();
  });

  it('cancels previous highlight when inputs change', async () => {
    const firstSpans: HighlightSpan[] = [{ start: 0, end: 1, category: 'keyword' }];
    const secondSpans: HighlightSpan[] = [{ start: 0, end: 2, category: 'string' }];

    let resolveFirst: (v: Map<number, HighlightSpan[]>) => void;
    const firstPromise = new Promise<Map<number, HighlightSpan[]>>((r) => {
      resolveFirst = r;
    });

    const secondMap = new Map<number, HighlightSpan[]>();
    secondMap.set(0, secondSpans);

    mockHighlightLines
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(secondMap);

    const hunks1 = [makeHunk([{ type: 'context', content: 'a' }])];
    const hunks2 = [makeHunk([{ type: 'context', content: 'b' }])];

    const { result, rerender } = renderHook(
      ({ filename, hunks }) => useSyntaxHighlight(filename, hunks),
      { initialProps: { filename: 'a.ts', hunks: hunks1 } },
    );

    // Rerender with new input before first resolves
    rerender({ filename: 'b.ts', hunks: hunks2 });

    // Now resolve the first - it should be cancelled
    const firstMap = new Map<number, HighlightSpan[]>();
    firstMap.set(0, firstSpans);
    resolveFirst!(firstMap);

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // Should have second result, not first
    expect(result.current!.get(0)).toEqual(secondSpans);
  });

  it('handles null result from highlightLines', async () => {
    mockHighlightLines.mockResolvedValue(null as unknown as Map<number, HighlightSpan[]>);

    const hunks = [makeHunk([{ type: 'context', content: 'const x = 1;' }])];
    const { result } = renderHook(() => useSyntaxHighlight('test.ts', hunks));

    // Wait a tick for the promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current).toBeNull();
  });

  it('passes filename and reconstructed lines to highlightLines', async () => {
    mockHighlightLines.mockResolvedValue(new Map());

    const hunks = [
      makeHunk([
        { type: 'context', content: 'line1' },
        { type: 'add', content: 'line2' },
        { type: 'delete', content: 'line3' },
      ]),
    ];

    renderHook(() => useSyntaxHighlight('app.tsx', hunks));

    await waitFor(() => {
      expect(mockHighlightLines).toHaveBeenCalledWith('app.tsx', ['line1', 'line2', 'line3']);
    });
  });
});
