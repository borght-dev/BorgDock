import { describe, expect, it } from 'vitest';
import { mergeSymbolHits, type SymbolEntry } from '../use-symbol-index';

describe('mergeSymbolHits', () => {
  const sample: SymbolEntry[] = [
    { name: 'handleLogin', rel_path: 'auth.ts', line: 10 },
    { name: 'HandleLogin', rel_path: 'page.cs', line: 5 },
    { name: 'handleLogout', rel_path: 'auth.ts', line: 42 },
  ];

  it('filters case-insensitively by substring', () => {
    const hits = mergeSymbolHits(sample, 'login');
    expect(hits.map((h) => h.rel_path).sort()).toEqual(['auth.ts', 'page.cs']);
  });

  it('returns empty on empty query', () => {
    expect(mergeSymbolHits(sample, '')).toEqual([]);
  });

  it('sorts hits by path then line', () => {
    const hits = mergeSymbolHits(sample, 'handle');
    expect(hits.map((h) => `${h.rel_path}:${h.line}`)).toEqual([
      'auth.ts:10',
      'auth.ts:42',
      'page.cs:5',
    ]);
  });
});
