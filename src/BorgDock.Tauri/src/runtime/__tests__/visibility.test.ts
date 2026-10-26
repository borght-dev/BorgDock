import type { EventCallback } from '@tauri-apps/api/event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startVisibilityTracking, trackPolling } from '../visibility';

const mocks = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(true), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
afterEach(() => {
  vi.restoreAllMocks();
});

describe('runtime visibility', () => {
  it('keeps polling visible while another native window is open and throttles when all close', async () => {
    let receive!: EventCallback<boolean>;
    const unlisten = vi.fn();
    mocks.listen.mockImplementation((_name, callback) => {
      receive = callback;
      return Promise.resolve(unlisten);
    });
    const poll = { setHidden: vi.fn() };
    const untrack = trackPolling(poll);
    const stop = startVisibilityTracking();
    await Promise.resolve();
    receive({ event: 'runtime-visibility', id: 1, payload: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(poll.setHidden).toHaveBeenLastCalledWith(false);
    receive({ event: 'runtime-visibility', id: 1, payload: false });
    expect(poll.setHidden).toHaveBeenLastCalledWith(true);
    receive({ event: 'runtime-visibility', id: 1, payload: true });
    expect(poll.setHidden).toHaveBeenLastCalledWith(false);
    stop();
    untrack();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
