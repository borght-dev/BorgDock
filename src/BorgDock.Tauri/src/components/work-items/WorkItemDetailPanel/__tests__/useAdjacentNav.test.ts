// src/components/work-items/WorkItemDetailPanel/__tests__/useAdjacentNav.test.ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAdjacentNav } from '../useAdjacentNav';

const NAVLIST_KEY = 'borgdock-palette-navlist';

describe('useAdjacentNav', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns nulls when no navlist saved', () => {
    const { result } = renderHook(() => useAdjacentNav(42));
    expect(result.current).toEqual({ prevId: null, nextId: null, total: 0, index: -1 });
  });

  it('returns adjacent ids when present', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3, 4], savedAt: Date.now() }),
    );
    const { result } = renderHook(() => useAdjacentNav(2));
    expect(result.current.prevId).toBe(1);
    expect(result.current.nextId).toBe(3);
    expect(result.current.total).toBe(4);
    expect(result.current.index).toBe(1);
  });

  it('null prev at start, null next at end', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3], savedAt: Date.now() }),
    );
    const head = renderHook(() => useAdjacentNav(1));
    expect(head.result.current.prevId).toBe(null);
    expect(head.result.current.nextId).toBe(2);

    const tail = renderHook(() => useAdjacentNav(3));
    expect(tail.result.current.prevId).toBe(2);
    expect(tail.result.current.nextId).toBe(null);
  });

  it('treats stale (>1h) as missing', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3], savedAt: Date.now() - 3700_000 }),
    );
    const { result } = renderHook(() => useAdjacentNav(2));
    expect(result.current.prevId).toBe(null);
    expect(result.current.nextId).toBe(null);
  });
});
