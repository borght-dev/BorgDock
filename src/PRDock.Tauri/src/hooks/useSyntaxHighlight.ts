import { useEffect, useState } from 'react';
import type { DiffHunk, HighlightSpan } from '@/types';
import { highlightLines } from '@/services/syntax-highlighter';

export function useSyntaxHighlight(
  filename: string,
  hunks: DiffHunk[],
): Map<number, HighlightSpan[]> | null {
  const [highlights, setHighlights] = useState<Map<number, HighlightSpan[]> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Reconstruct source lines from the diff hunks (head-side)
    const allLines: string[] = [];
    const lineIndexMap = new Map<number, number>(); // diff line index → source line index

    let idx = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'hunk-header') {
          idx++;
          continue;
        }
        // Use head-side content for adds and context, base-side for deletes
        allLines.push(line.content);
        lineIndexMap.set(idx, allLines.length - 1);
        idx++;
      }
    }

    if (allLines.length === 0) return;

    highlightLines(filename, allLines).then((result) => {
      if (cancelled || !result) return;

      // Remap source line indices back to diff line indices
      const remapped = new Map<number, HighlightSpan[]>();
      for (const [diffIdx, sourceIdx] of lineIndexMap) {
        const spans = result.get(sourceIdx);
        if (spans) remapped.set(diffIdx, spans);
      }
      setHighlights(remapped);
    });

    return () => {
      cancelled = true;
    };
  }, [filename, hunks]);

  return highlights;
}
