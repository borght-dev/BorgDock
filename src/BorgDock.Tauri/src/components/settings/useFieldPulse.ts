// src/components/settings/useFieldPulse.ts
import { createContext, useContext, useEffect } from 'react';

interface PulseCtx {
  pulseAnchor: string | null;
  setPulseAnchor: (a: string | null) => void;
}

const Ctx = createContext<PulseCtx>({
  pulseAnchor: null,
  setPulseAnchor: () => {},
});

export const PulseProvider = Ctx.Provider;
export function usePulseTarget() { return useContext(Ctx); }

/**
 * Hook used by `Field`. When this anchor matches the currently-set pulse
 * target, schedule scrollIntoView on the matching `#field-{anchorId}` and
 * return a className that gives the field a brief accent-subtle background.
 * Auto-clears the pulse after 600 ms.
 */
export function useFieldPulse(anchorId?: string): string {
  const { pulseAnchor, setPulseAnchor } = usePulseTarget();
  const isPulsing = !!anchorId && pulseAnchor === anchorId;
  useEffect(() => {
    if (!isPulsing || !anchorId) return;
    const el = document.getElementById(`field-${anchorId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setPulseAnchor(null), 600);
    return () => clearTimeout(t);
  }, [isPulsing, anchorId, setPulseAnchor]);
  return isPulsing
    ? 'bg-[var(--color-accent-subtle)] transition-colors duration-300'
    : '';
}
