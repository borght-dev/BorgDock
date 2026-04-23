import { describe, expect, it } from 'vitest';
import type { ToastPayload } from '../flyout-mode';
import { reduceFlyoutMode, initialFlyoutMode, TOAST_MAX, TOAST_AUTOHIDE_MS } from '../flyout-mode';

const makeToast = (id: string, severity: ToastPayload['severity'] = 'info'): ToastPayload => ({
  id,
  severity,
  title: `title-${id}`,
  body: `body-${id}`,
  actions: [],
});

describe('reduceFlyoutMode', () => {
  it('starts in initializing', () => {
    expect(initialFlyoutMode.kind).toBe('initializing');
  });

  it('init-complete with no pending toasts becomes idle', () => {
    const next = reduceFlyoutMode(initialFlyoutMode, { type: 'init-complete' }, 1000);
    expect(next.kind).toBe('idle');
  });

  it('user-open from idle enters glance', () => {
    const next = reduceFlyoutMode({ kind: 'idle' }, { type: 'user-open' }, 1000);
    expect(next.kind).toBe('glance');
  });

  it('toast from idle enters toast with one queue item and deadline', () => {
    const t = makeToast('a');
    const next = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: t }, 1000);
    expect(next.kind).toBe('toast');
    if (next.kind !== 'toast') return;
    expect(next.queue).toHaveLength(1);
    expect(next.queue[0]!.id).toBe('a');
    expect(next.timerDeadline).toBe(1000 + TOAST_AUTOHIDE_MS);
  });

  it('toast while toast appends and resets deadline', () => {
    const first = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(first, { type: 'toast', payload: makeToast('b') }, 3000);
    expect(next.kind).toBe('toast');
    if (next.kind !== 'toast') return;
    expect(next.queue.map((t) => t.id)).toEqual(['a', 'b']);
    expect(next.timerDeadline).toBe(3000 + TOAST_AUTOHIDE_MS);
  });

  it('toast overflow evicts oldest past TOAST_MAX', () => {
    let m = { kind: 'idle' } as ReturnType<typeof reduceFlyoutMode>;
    for (let i = 0; i < TOAST_MAX + 1; i++) {
      m = reduceFlyoutMode(m, { type: 'toast', payload: makeToast(String(i)) }, 1000 + i);
    }
    expect(m.kind).toBe('toast');
    if (m.kind !== 'toast') return;
    expect(m.queue).toHaveLength(TOAST_MAX);
    expect(m.queue[0]!.id).toBe('1'); // '0' was evicted
  });

  it('toast while glance attaches banner, stays in glance, no timer', () => {
    const next = reduceFlyoutMode(
      { kind: 'glance' },
      { type: 'toast', payload: makeToast('x', 'warning') },
      2000,
    );
    expect(next.kind).toBe('glance');
    if (next.kind !== 'glance') return;
    expect(next.banner?.id).toBe('x');
  });

  it('user-open while toast transitions to glance', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(toastState, { type: 'user-open' }, 2000);
    expect(next.kind).toBe('glance');
  });

  it('close from any visible state goes to idle', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    expect(reduceFlyoutMode(toastState, { type: 'close' }, 2000).kind).toBe('idle');
    expect(reduceFlyoutMode({ kind: 'glance' }, { type: 'close' }, 2000).kind).toBe('idle');
  });

  it('timer-expired while toast goes to idle', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const next = reduceFlyoutMode(toastState, { type: 'timer-expired' }, 1000 + TOAST_AUTOHIDE_MS + 1);
    expect(next.kind).toBe('idle');
  });

  it('hover-enter clears deadline; hover-leave resets it', () => {
    const toastState = reduceFlyoutMode({ kind: 'idle' }, { type: 'toast', payload: makeToast('a') }, 1000);
    const hovered = reduceFlyoutMode(toastState, { type: 'hover-enter' }, 2000);
    if (hovered.kind !== 'toast') throw new Error('expected toast');
    expect(hovered.timerDeadline).toBe(null);
    const left = reduceFlyoutMode(hovered, { type: 'hover-leave' }, 5000);
    if (left.kind !== 'toast') throw new Error('expected toast');
    expect(left.timerDeadline).toBe(5000 + TOAST_AUTOHIDE_MS);
  });
});
