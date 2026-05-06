import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStatusBar } from '../useStatusBar';

describe('useStatusBar', () => {
  it('returns Focus copy', () => {
    const { result } = renderHook(() => useStatusBar('focus'));
    expect(result.current.left).toMatch(/focus/i);
    expect(result.current.right).toMatch(/Quick Review/i);
  });
  it('returns PRs copy with rate', () => {
    const { result } = renderHook(() => useStatusBar('prs'));
    expect(result.current.left).toMatch(/synced/i);
    expect(result.current.right).toMatch(/F7|F8|F9/);
  });
  it('returns Work Items copy', () => {
    const { result } = renderHook(() => useStatusBar('workitems'));
    expect(result.current.left).toMatch(/ado:/i);
    expect(result.current.right).toMatch(/F9/i);
  });
});
