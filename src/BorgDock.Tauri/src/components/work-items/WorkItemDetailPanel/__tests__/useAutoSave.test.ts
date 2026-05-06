// src/components/work-items/WorkItemDetailPanel/__tests__/useAutoSave.test.ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave, type AutoSaveValues } from '../useAutoSave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const initial: AutoSaveValues = {
  title: 'Original',
  state: 'Active',
  assignedTo: 'Alice',
  priority: 2,
  tags: '',
};

describe('useAutoSave', () => {
  it('does not call onPatch when nothing changed', () => {
    const onPatch = vi.fn();
    const { result } = renderHook(() => useAutoSave({ initial, onPatch }));
    act(() => result.current.flush(initial));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('debounces and emits patch with only the dirty fields', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, title: 'Updated' }));
    expect(onPatch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onPatch).toHaveBeenCalledWith({ title: 'Updated' });
  });

  it('marks isSaving and updates lastSavedAt on success', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, state: 'Resolved' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('records error on failure and keeps lastSavedAt unchanged', async () => {
    const onPatch = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, state: 'Resolved' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.error).toBe('boom');
  });
});
