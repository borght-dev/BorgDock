import { describe, expect, it } from 'vitest';
import { shareEntities, shareValue } from '../structural-sharing';

describe('structural sharing', () => {
  it('keeps unchanged entities and nested values while updating changed fields', () => {
    const previous = [
      { id: 1, checks: { passed: 2 }, labels: ['bug'] },
      { id: 2, checks: { passed: 1 }, labels: [] },
    ];
    const unchanged = structuredClone(previous);
    expect(shareEntities(previous, unchanged, (entry) => entry.id)).toBe(previous);
    const next = structuredClone(previous);
    next[0]!.checks.passed = 3;
    const merged = shareEntities(previous, next, (entry) => entry.id);
    expect(merged).not.toBe(previous);
    expect(merged[0]!.checks.passed).toBe(3);
    expect(merged[0]!.labels).toBe(previous[0]!.labels);
    expect(merged[1]).toBe(previous[1]);
  });

  it('tracks additions, removals, ordering and optional property removal', () => {
    const previous = [{ id: 1 }, { id: 2 }];
    const reordered = shareEntities(previous, [{ id: 2 }, { id: 1 }], (entry) => entry.id);
    expect(reordered[0]).toBe(previous[1]);
    expect(shareEntities(previous, [{ id: 1 }], (entry) => entry.id)).toHaveLength(1);
    expect(shareEntities(previous, [{ id: 3 }], (entry) => entry.id)[0]).toEqual({ id: 3 });
    expect(shareValue({ optional: undefined }, {})).toEqual({});
    expect(shareValue({}, { optional: undefined })).toHaveProperty('optional');
  });
});
