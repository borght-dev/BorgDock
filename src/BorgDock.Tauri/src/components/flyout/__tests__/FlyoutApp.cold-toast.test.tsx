import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(),
  visible: false,
  listeners: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: mocks.emit,
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    const callbacks = mocks.listeners.get(name) ?? new Set();
    callbacks.add(callback);
    mocks.listeners.set(name, callbacks);
    return () => callbacks.delete(callback);
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isVisible: async () => mocks.visible,
    onFocusChanged: async () => () => {},
  }),
}));

import { FlyoutApp } from '../FlyoutApp';

describe('first notification before opening the flyout', () => {
  afterEach(() => {
    cleanup();
    mocks.visible = false;
    mocks.listeners.clear();
    vi.resetAllMocks();
  });

  it.each([
    null,
    JSON.stringify({ pullRequests: [], totalCount: 3 }),
  ])('receives the pending toast after boot with cache %s', async (cached) => {
    let finishCache!: (value: string | null) => void;
    const cache = new Promise<string | null>((resolve) => {
      finishCache = resolve;
    });
    mocks.invoke.mockImplementation((command: string) =>
      command === 'get_flyout_data' ? cache : Promise.resolve(null),
    );
    mocks.emit.mockImplementation(async (name: string) => {
      if (name !== 'flyout-toast-ready') return;
      const callbacks = mocks.listeners.get('flyout-toast');
      expect(callbacks?.size).toBe(1);
      for (const callback of callbacks ?? []) {
        callback({
          payload: {
            id: 'first-toast',
            severity: 'info',
            title: 'First notification',
            body: 'Arrived before opening the flyout',
            actions: [],
          },
        });
      }
    });
    render(
      <StrictMode>
        <FlyoutApp />
      </StrictMode>,
    );
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('get_flyout_data'));
    expect(mocks.emit).not.toHaveBeenCalled();
    await act(async () => {
      finishCache(cached);
    });
    expect(await screen.findByText('First notification')).toBeInTheDocument();
    expect(screen.queryByTestId('flyout-initializing')).not.toBeInTheDocument();
    expect(mocks.emit).toHaveBeenCalledWith('flyout-toast-ready');
    mocks.visible = true;
    await act(async () => {
      for (const callback of mocks.listeners.get('init-complete') ?? []) {
        callback({ payload: null });
      }
    });
    expect(screen.getByText('First notification')).toBeInTheDocument();
  });
});
