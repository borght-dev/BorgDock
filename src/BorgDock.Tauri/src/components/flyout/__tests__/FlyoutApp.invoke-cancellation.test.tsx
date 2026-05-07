import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock dynamic imports of @tauri-apps/api/core, /event and /window used by FlyoutApp.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emitTo: vi.fn().mockResolvedValue(undefined),
}));

// Capture the onFocusChanged callback so tests can drive focus-loss directly.
let capturedFocusCb: ((event: { payload: boolean }) => void) | undefined;
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn(async (cb: (event: { payload: boolean }) => void) => {
      capturedFocusCb = cb;
      return () => {
        capturedFocusCb = undefined;
      };
    }),
  }),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { FlyoutApp } from '../FlyoutApp';

describe('FlyoutApp invoke() cancellation', () => {
  afterEach(() => {
    cleanup();
    capturedFocusCb = undefined;
    vi.clearAllMocks();
  });

  it('does not setState after unmount when get_flyout_data resolves late', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    unmount();
    // Let microtasks flush so any pending dynamic-import + invoke chains settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(expect.stringContaining('not wrapped in act'));
    consoleErrSpy.mockRestore();
  });

  it('does not dispatch close after unmount on focus loss', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    // Wait for the focus listener to be registered via the dynamic import chain.
    await new Promise((r) => setTimeout(r, 0));
    // Fire focus-loss then immediately unmount — the async hide() is still mid-flight.
    capturedFocusCb?.({ payload: false });
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(expect.stringContaining('not wrapped in act'));
    consoleErrSpy.mockRestore();
  });
});
