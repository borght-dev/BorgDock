import { describe, expect, it } from 'vitest';
import { scanFindMatches } from '../FilePaletteCodeView';

describe('scanFindMatches', () => {
  it('finds case-insensitive matches with line and column', () => {
    const content = 'foo\nFooBar\nzzz';
    const m = scanFindMatches(content, 'foo');
    expect(m).toEqual([
      { line: 1, col: 0, length: 3 },
      { line: 2, col: 0, length: 3 },
    ]);
  });

  it('finds multiple matches per line', () => {
    const m = scanFindMatches('abab', 'ab');
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ line: 1, col: 0, length: 2 });
    expect(m[1]).toEqual({ line: 1, col: 2, length: 2 });
  });

  it('returns empty for empty term', () => {
    expect(scanFindMatches('anything', '')).toEqual([]);
  });
});
