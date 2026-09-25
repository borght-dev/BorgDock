import type { ReactNode } from 'react';
import { create } from 'zustand';
import { parseError } from '@/utils/parse-error';

export type ToastTone = 'info' | 'success' | 'error' | 'progress';

export interface ToastInput {
  message: ReactNode;
  tone?: ToastTone;
  /** Shown before the message, e.g. a "Merging" pill. */
  leading?: ReactNode;
  /** Label of the one action button, e.g. "Undo". Needs `onAction`. */
  actionLabel?: string;
  /** Runs when the action is clicked; the toast then goes away. */
  onAction?: () => void;
  /** Auto-dismiss after this long. Default `TOAST_DURATION_MS`; 0 keeps it until dismissed. */
  durationMs?: number;
  /** Runs when the toast times out (not when it is dismissed or its action is clicked). */
  onExpire?: () => void;
  /**
   * Show the close button (default true). A toast whose action is the only
   * way to cancel something (Merge's Undo) sets false, so closing it cannot
   * be mistaken for cancelling.
   */
  dismissible?: boolean;
}

export interface ToastItem extends ToastInput {
  id: string;
  tone: ToastTone;
}

/** Default auto-dismiss delay. */
export const TOAST_DURATION_MS = 5000;
/** At most this many toasts are drawn; older ones keep running underneath. */
export const TOAST_STACK_LIMIT = 3;

interface ToastState {
  toasts: ToastItem[];
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  /** Clicks the toast's action: runs `onAction`, then dismisses. */
  act: (id: string) => void;
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let seq = 0;

/**
 * The toasts drawn: at most `TOAST_STACK_LIMIT`, in order. When there are
 * more, the oldest toasts without an action are hidden first, so an Undo
 * stays reachable; only when every toast has an action does the oldest one
 * go. A hidden toast with an action does not expire while it is hidden.
 */
export function visibleToasts(toasts: readonly ToastItem[]): ToastItem[] {
  const visible = [...toasts];
  while (visible.length > TOAST_STACK_LIMIT) {
    const plain = visible.findIndex((t) => !t.onAction);
    visible.splice(plain >= 0 ? plain : 0, 1);
  }
  return visible;
}

function stopTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

/**
 * Toasts of the main window (plans/ui-overhaul-workbench.md, section 4:
 * "Toast"): merge results, action failures, review submission errors, the
 * Focus merge-with-undo. `ToastViewport` (components/shared/Toast.tsx) draws
 * the newest `TOAST_STACK_LIMIT`.
 */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (input) => {
    seq += 1;
    const id = `toast-${seq}`;
    const item: ToastItem = { ...input, id, tone: input.tone ?? 'info' };
    set((s) => ({ toasts: [...s.toasts, item] }));
    const duration = input.durationMs ?? TOAST_DURATION_MS;
    const arm = () => {
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          const toasts = get().toasts;
          const current = toasts.find((t) => t.id === id);
          if (!current) return;
          // Its Undo is out of reach while hidden: wait until it is shown.
          if (current.onAction && !visibleToasts(toasts).includes(current)) {
            arm();
            return;
          }
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
          current.onExpire?.();
        }, duration),
      );
    };
    if (duration > 0) arm();
    return id;
  },
  dismiss: (id) => {
    stopTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  act: (id) => {
    const toast = get().toasts.find((t) => t.id === id);
    if (!toast) return;
    get().dismiss(id);
    toast.onAction?.();
  },
  clear: () => {
    for (const id of timers.keys()) stopTimer(id);
    set({ toasts: [] });
  },
}));

export function showToast(input: ToastInput): string {
  return useToastStore.getState().show(input);
}

export function dismissToast(id: string): void {
  useToastStore.getState().dismiss(id);
}

/** An error toast: "Merge failed: Pull request is not mergeable". */
export function toastError(title: string, err: unknown): string {
  return showToast({ tone: 'error', message: `${title}: ${parseError(err).message}` });
}
