import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emitTo: vi.fn().mockResolvedValue(undefined),
}));
let visible = true;
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isVisible: async () => visible,
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
}));

import { FlyoutApp } from '../FlyoutApp';

const CACHED = {
  pullRequests: [],
  failingCount: 0,
  pendingCount: 0,
  passingCount: 0,
  totalCount: 3,
  focusCount: 0,
  username: 'me',
  theme: 'light',
  lastSyncAgo: '5s ago',
  hotkey: 'Ctrl+Win+Shift+G',
};

describe('FlyoutApp lazily built after main init', () => {
  afterEach(() => {
    cleanup();
    invoke.mockReset();
    visible = true;
  });

  it('opens straight to the glance when cached data exists and the window is visible', async () => {
    invoke.mockResolvedValue(JSON.stringify(CACHED));
    render(<FlyoutApp />);
    expect(await screen.findByText('3 open pull requests')).toBeInTheDocument();
    expect(screen.queryByTestId('flyout-initializing')).not.toBeInTheDocument();
  });

  it('stays hidden (idle) when cached data exists but the window is hidden', async () => {
    visible = false;
    invoke.mockResolvedValue(JSON.stringify(CACHED));
    const { container } = render(<FlyoutApp />);
    await vi.waitFor(() => expect(container.querySelector('[data-app-ready]')).not.toBeNull());
    expect(screen.queryByText('3 open pull requests')).not.toBeInTheDocument();
  });

  it('shows the loading skeleton when there is no cached data yet', async () => {
    invoke.mockResolvedValue(null);
    render(<FlyoutApp />);
    expect(screen.getByTestId('flyout-initializing')).toBeInTheDocument();
  });
});
