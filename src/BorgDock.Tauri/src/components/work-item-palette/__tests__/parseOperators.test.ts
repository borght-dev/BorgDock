// src/components/work-item-palette/__tests__/parseOperators.test.ts
import { describe, expect, it } from 'vitest';
import { applyOperators, parseOperators } from '../parseOperators';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

describe('parseOperators', () => {
  it('extracts state: tokens', () => {
    const { ops, freeText } = parseOperators('state:active fix toast');
    expect(ops).toEqual([{ kind: 'state', rawKey: 'state', value: 'active' }]);
    expect(freeText).toBe('fix toast');
  });

  it('extracts @user mentions', () => {
    const { ops, freeText } = parseOperators('@me crash');
    expect(ops).toEqual([{ kind: 'mention', value: 'me' }]);
    expect(freeText).toBe('crash');
  });

  it('extracts type: tokens', () => {
    const { ops } = parseOperators('type:bug');
    expect(ops).toEqual([{ kind: 'type', rawKey: 'type', value: 'bug' }]);
  });

  it('handles multiple operators', () => {
    const { ops, freeText } = parseOperators('state:active type:bug @me toast');
    expect(ops).toHaveLength(3);
    expect(freeText).toBe('toast');
  });

  it('returns empty ops for plain text', () => {
    const { ops, freeText } = parseOperators('plain query');
    expect(ops).toEqual([]);
    expect(freeText).toBe('plain query');
  });
});

describe('applyOperators', () => {
  const items: ResultItem[] = [
    { id: 1, title: 'Save toast', state: 'Active', workItemType: 'Bug', assignedTo: 'KV' },
    { id: 2, title: 'Empty pages', state: 'New', workItemType: 'Task', assignedTo: 'SS' },
    { id: 3, title: 'Refresh chat', state: 'Active', workItemType: 'Bug', assignedTo: 'TB' },
  ];

  it('filters by state operator (case-insensitive substring on state)', () => {
    const result = applyOperators(items, [{ kind: 'state', value: 'active' }], new Set());
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it('filters by type operator', () => {
    const result = applyOperators(items, [{ kind: 'type', value: 'bug' }], new Set());
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it('filters @me by membership in assignedToMeIds', () => {
    const result = applyOperators(
      items,
      [{ kind: 'mention', value: 'me' }],
      new Set([1]),
    );
    expect(result.map((i) => i.id)).toEqual([1]);
  });

  it('returns input unchanged when ops empty', () => {
    expect(applyOperators(items, [], new Set())).toEqual(items);
  });
});
