import { describe, expect, it } from 'vitest';
import { getHighlightClass } from '../syntax-highlighter';
import type { HighlightCategory } from '@/types';

describe('getHighlightClass', () => {
  const categories: HighlightCategory[] = [
    'keyword', 'string', 'comment', 'number', 'type',
    'function', 'variable', 'operator', 'punctuation',
    'constant', 'property', 'tag', 'attribute', 'plain',
  ];

  it('returns a CSS custom property name for each category', () => {
    for (const cat of categories) {
      const result = getHighlightClass(cat);
      expect(result).toBe(`--color-syntax-${cat}`);
    }
  });

  it('output can be used in var() CSS function', () => {
    const result = getHighlightClass('keyword');
    expect(`var(${result})`).toBe('var(--color-syntax-keyword)');
  });
});
