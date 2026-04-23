export const TOAST_MAX = 3;
export const TOAST_AUTOHIDE_MS = 7000;

export interface ToastAction {
  label: string;
  action: 'open-pr' | 'fix-pr' | 'monitor-pr' | 'open-url' | 'merge-pr' | 'start-review';
  url?: string;
}

export interface ToastPayload {
  id: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  prOwner?: string;
  prRepo?: string;
  prNumber?: number;
  actions: ToastAction[];
}

export type FlyoutMode =
  | { kind: 'initializing' }
  | { kind: 'idle' }
  | { kind: 'glance'; banner?: ToastPayload }
  | { kind: 'toast'; queue: ToastPayload[]; timerDeadline: number | null };

export type FlyoutEvent =
  | { type: 'init-complete' }
  | { type: 'user-open' }
  | { type: 'toast'; payload: ToastPayload }
  | { type: 'close' }
  | { type: 'timer-expired' }
  | { type: 'hover-enter' }
  | { type: 'hover-leave' };

export const initialFlyoutMode: FlyoutMode = { kind: 'initializing' };

/**
 * Pure reducer — the single source of truth for flyout mode transitions.
 * `now` is injected so the timer deadline is testable without wall-clock.
 */
export function reduceFlyoutMode(mode: FlyoutMode, event: FlyoutEvent, now: number): FlyoutMode {
  switch (event.type) {
    case 'init-complete':
      return mode.kind === 'initializing' ? { kind: 'idle' } : mode;

    case 'user-open':
      return { kind: 'glance' };

    case 'close':
      return { kind: 'idle' };

    case 'toast': {
      if (mode.kind === 'glance') return { kind: 'glance', banner: event.payload };
      if (mode.kind === 'initializing') return mode;

      const prev = mode.kind === 'toast' ? mode.queue : [];
      const next = [...prev, event.payload];
      const trimmed = next.length > TOAST_MAX ? next.slice(next.length - TOAST_MAX) : next;
      return {
        kind: 'toast',
        queue: trimmed,
        timerDeadline: now + TOAST_AUTOHIDE_MS,
      };
    }

    case 'timer-expired':
      return mode.kind === 'toast' ? { kind: 'idle' } : mode;

    case 'hover-enter':
      return mode.kind === 'toast' ? { ...mode, timerDeadline: null } : mode;

    case 'hover-leave':
      return mode.kind === 'toast' ? { ...mode, timerDeadline: now + TOAST_AUTOHIDE_MS } : mode;
  }
}
