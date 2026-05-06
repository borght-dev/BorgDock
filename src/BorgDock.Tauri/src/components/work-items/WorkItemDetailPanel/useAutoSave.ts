// src/components/work-items/WorkItemDetailPanel/useAutoSave.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutoSaveValues {
  title: string;
  state: string;
  assignedTo: string;
  priority?: number;
  tags: string;
}

export type AutoSavePatch = Partial<AutoSaveValues>;

export interface UseAutoSaveArgs {
  initial: AutoSaveValues;
  onPatch: (patch: AutoSavePatch) => Promise<void>;
  debounceMs?: number;
}

export interface UseAutoSaveResult {
  isSaving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  /** Submit the latest values; debounces the patch. */
  flush: (values: AutoSaveValues) => void;
  /** Manually clear the error state (e.g. after retry). */
  clearError: () => void;
}

function diff(a: AutoSaveValues, b: AutoSaveValues): AutoSavePatch {
  const out: AutoSavePatch = {};
  (Object.keys(b) as (keyof AutoSaveValues)[]).forEach((k) => {
    if (a[k] !== b[k]) (out as Record<string, unknown>)[k] = b[k];
  });
  return out;
}

export function useAutoSave({
  initial,
  onPatch,
  debounceMs = 500,
}: UseAutoSaveArgs): UseAutoSaveResult {
  const lastSavedRef = useRef<AutoSaveValues>(initial);
  const pendingRef = useRef<AutoSaveValues | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(
    (values: AutoSaveValues) => {
      pendingRef.current = values;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const target = pendingRef.current;
        if (!target) return;
        const patch = diff(lastSavedRef.current, target);
        if (Object.keys(patch).length === 0) return;
        setIsSaving(true);
        setError(null);
        try {
          await onPatch(patch);
          lastSavedRef.current = target;
          setLastSavedAt(Date.now());
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setIsSaving(false);
        }
      }, debounceMs);
    },
    [onPatch, debounceMs],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isSaving, lastSavedAt, error, flush, clearError };
}
