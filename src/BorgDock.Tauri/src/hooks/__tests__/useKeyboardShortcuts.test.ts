import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import type { InspectorState } from '../useInspectorState';

const invokeMock = vi.fn().mockResolvedValue(true);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

function fake(over: Partial<InspectorState> = {}): InspectorState {
  return {
    hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null, openSessionId: null,
    onCardEnter: vi.fn(), onCardLeave: vi.fn(), onPopoverEnter: vi.fn(), onPopoverLeave: vi.fn(),
    onCardClick: vi.fn(), togglePin: vi.fn(), unpin: vi.fn(), cycleFocus: vi.fn(), closeAll: vi.fn(),
    ...over,
  };
}

function press(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...opts }));
}

describe('useKeyboardShortcuts', () => {
  it('Tab calls cycleFocus(1); Shift+Tab calls cycleFocus(-1)', () => {
    const i = fake();
    renderHook(() => useKeyboardShortcuts(i));
    press('Tab');
    expect(i.cycleFocus).toHaveBeenCalledWith(1);
    press('Tab', { shiftKey: true });
    expect(i.cycleFocus).toHaveBeenCalledWith(-1);
  });

  it('Esc unpins when pinned, otherwise closeAll', () => {
    const pinned = fake({ pinnedSessionId: 's1', openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(pinned));
    press('Escape');
    expect(pinned.unpin).toHaveBeenCalled();

    const notPinned = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(notPinned));
    press('Escape');
    expect(notPinned.closeAll).toHaveBeenCalled();
  });

  it('F triggers focus_session_pane only when popover is open', () => {
    invokeMock.mockClear();
    const closed = fake();
    const { unmount: u1 } = renderHook(() => useKeyboardShortcuts(closed));
    press('F');
    expect(invokeMock).not.toHaveBeenCalled();
    u1();

    const open = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(open));
    press('F');
    expect(invokeMock).toHaveBeenCalledWith('focus_session_pane', { sessionId: 's1' });
  });

  it('S calls snooze command and closeAll', () => {
    invokeMock.mockClear();
    const open = fake({ openSessionId: 's1' });
    renderHook(() => useKeyboardShortcuts(open));
    press('S');
    expect(invokeMock).toHaveBeenCalledWith('snooze_agent_session', expect.objectContaining({ sessionId: 's1' }));
    expect(open.closeAll).toHaveBeenCalled();
  });

  it('ignores keys when an input is focused', () => {
    const i = fake();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useKeyboardShortcuts(i));
    press('Tab');
    expect(i.cycleFocus).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
