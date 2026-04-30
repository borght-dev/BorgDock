import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let listeners: Array<(p: unknown) => void> = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([{ sessionId: 'a', state: 'working' }]),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_evt: string, cb: (p: unknown) => void) => {
    listeners.push(cb);
    return () => {
      listeners = [];
    };
  }),
}));

import { useAgentSessions } from '../useAgentSessions';

describe('useAgentSessions', () => {
  it('seeds from invoke and applies upsert/remove deltas', async () => {
    const { result } = renderHook(() => useAgentSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.length).toBe(1);

    await act(async () => {
      listeners[0]?.({
        payload: { kind: 'upsert', session: { sessionId: 'b', state: 'awaiting' } },
      });
    });
    expect(result.current.length).toBe(2);

    await act(async () => {
      listeners[0]?.({ payload: { kind: 'remove', sessionId: 'a' } });
    });
    expect(result.current.find((s) => s.sessionId === 'a')).toBeUndefined();
  });
});
