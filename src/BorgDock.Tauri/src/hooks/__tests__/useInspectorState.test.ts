import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInspectorState } from '../useInspectorState';

describe('useInspectorState — hover lifecycle', () => {
  it('opens on card enter, closes after 220ms on leave', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    expect(result.current.openSessionId).toBe('s1');
    act(() => result.current.onCardLeave('s1'));
    expect(result.current.openSessionId).toBe('s1');
    act(() => { vi.advanceTimersByTime(220); });
    expect(result.current.openSessionId).toBeNull();
    vi.useRealTimers();
  });

  it('cancels close when popover entered before grace expires', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    act(() => result.current.onCardLeave('s1'));
    act(() => { vi.advanceTimersByTime(100); });
    act(() => result.current.onPopoverEnter());
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.openSessionId).toBe('s1');
    vi.useRealTimers();
  });
});

describe('useInspectorState — pin', () => {
  it('click pins; leave does not close while pinned', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.onCardEnter('s1'));
    act(() => result.current.onCardClick('s1'));
    act(() => result.current.onCardLeave('s1'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.openSessionId).toBe('s1');
    expect(result.current.pinnedSessionId).toBe('s1');
    vi.useRealTimers();
  });

  it('togglePin unpins same id, pins new id', () => {
    const { result } = renderHook(() => useInspectorState([]));
    act(() => result.current.togglePin('s1'));
    expect(result.current.pinnedSessionId).toBe('s1');
    act(() => result.current.togglePin('s1'));
    expect(result.current.pinnedSessionId).toBeNull();
    act(() => result.current.togglePin('s2'));
    expect(result.current.pinnedSessionId).toBe('s2');
  });
});

describe('useInspectorState — Tab cycling', () => {
  it('cycles forward through awaiting and wraps at the end', () => {
    const { result } = renderHook(() => useInspectorState(['a', 'b', 'c']));
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('a');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('b');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('c');
    act(() => result.current.cycleFocus(1));
    expect(result.current.focusedSessionId).toBe('a');
  });

  it('cycles backward and wraps from start to end', () => {
    const { result } = renderHook(() => useInspectorState(['a', 'b', 'c']));
    act(() => result.current.cycleFocus(-1));
    expect(result.current.focusedSessionId).toBe('c');
  });
});

describe('useInspectorState — closeAll', () => {
  it('clears all three state buckets', () => {
    const { result } = renderHook(() => useInspectorState(['a']));
    act(() => result.current.onCardEnter('a'));
    act(() => result.current.onCardClick('a'));
    act(() => result.current.cycleFocus(1));
    act(() => result.current.closeAll());
    expect(result.current.openSessionId).toBeNull();
  });
});
