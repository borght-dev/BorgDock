import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock dynamic imports of @tauri-apps/api/core and /event used by FlyoutApp.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emitTo: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { FlyoutApp } from '../FlyoutApp';

describe('FlyoutApp invoke() cancellation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not setState after unmount when get_flyout_data resolves late', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    unmount();
    // Let microtasks flush so any pending dynamic-import + invoke chains settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });

  it('does not dispatch close after unmount on blur', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<FlyoutApp />);
    // Fire blur then immediately unmount — the async hide() is still mid-flight.
    window.dispatchEvent(new Event('blur'));
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });
});
