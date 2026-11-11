import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(null),
  listeners: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    const callbacks = mocks.listeners.get(name) ?? new Set();
    callbacks.add(callback);
    mocks.listeners.set(name, callbacks);
    return () => callbacks.delete(callback);
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isVisible: async () => false,
    onFocusChanged: async () => () => {},
  }),
}));

import { FlyoutApp } from '../FlyoutApp';

async function notify(id: string) {
  await act(async () => {
    for (const callback of mocks.listeners.get('flyout-toast') ?? []) {
      callback({ payload: { id, severity: 'info', title: id, body: 'Notification', actions: [] } });
    }
  });
  expect(screen.getByText(id)).toBeInTheDocument();
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('native flyout visibility after notifications', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(
        <StrictMode>
          <FlyoutApp />
        </StrictMode>,
      );
    });
    expect(mocks.listeners.get('flyout-toast')?.size).toBe(1);
  });

  afterEach(() => {
    cleanup();
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('hides the native window when the last toast expires', async () => {
    expect(mocks.invoke).not.toHaveBeenCalledWith('hide_flyout');
    await notify('Expires');
    await advance(7500);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith('hide_flyout');
  });

  it('hides the native window after dismissing the final toast', async () => {
    await notify('Dismissed');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await advance(300);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith('hide_flyout');
  });

  it('keeps remaining notifications visible until the final dismissal', async () => {
    await notify('First');
    await notify('Second');
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    await advance(300);
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalledWith('hide_flyout');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await advance(300);
    expect(mocks.invoke).toHaveBeenCalledWith('hide_flyout');
  });
});
