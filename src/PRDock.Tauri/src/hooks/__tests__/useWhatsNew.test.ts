import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, getVersionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));

const storeState = {
  lastSeenVersion: null as string | null,
  autoOpenDisabled: false,
  hydrated: false,
  hydrate: vi.fn(async () => {}),
  setLastSeenVersion: vi.fn(async (v: string) => {
    storeState.lastSeenVersion = v;
  }),
  disableAutoOpen: vi.fn(async (v: string) => {
    storeState.autoOpenDisabled = true;
    storeState.lastSeenVersion = v;
  }),
};
vi.mock('@/stores/whats-new-store', () => ({
  useWhatsNewStore: Object.assign(() => storeState, {
    getState: () => storeState,
    setState: (partial: Partial<typeof storeState>) => Object.assign(storeState, partial),
  }),
}));

const RELEASES_VALUE: Array<{
  version: string;
  autoOpenEligible: boolean;
  highlights: unknown[];
  alsoFixed: unknown[];
  date: string;
  summary: string;
}> = [];
vi.mock('@/generated/changelog', () => ({
  get RELEASES() {
    return RELEASES_VALUE;
  },
}));

import { useWhatsNew } from '../useWhatsNew';

beforeEach(() => {
  invokeMock.mockReset();
  getVersionMock.mockReset();
  storeState.lastSeenVersion = null;
  storeState.autoOpenDisabled = false;
  storeState.hydrated = false;
  storeState.hydrate.mockClear();
  storeState.setLastSeenVersion.mockClear();
  storeState.disableAutoOpen.mockClear();
  RELEASES_VALUE.length = 0;
});

describe('useWhatsNew', () => {
  it('seeds lastSeenVersion on first run and does not auto-open', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.setLastSeenVersion).toHaveBeenCalledWith('1.0.11');
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });

  it('auto-opens when a missed release is eligible', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.9';
    });
    RELEASES_VALUE.push(
      {
        version: '1.0.11',
        date: '2026-04-14',
        summary: 's',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: true,
      },
      {
        version: '1.0.10',
        date: '2026-04-01',
        summary: '',
        highlights: [],
        alsoFixed: [],
        autoOpenEligible: false,
      },
    );

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_whats_new_window', { version: null });
    });
  });

  it('does not auto-open when only bugfix-only releases were missed', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.10';
    });
    RELEASES_VALUE.push({
      version: '1.0.11',
      date: '2026-04-14',
      summary: '',
      highlights: [],
      alsoFixed: ['fix'],
      autoOpenEligible: false,
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.hydrate).toHaveBeenCalled();
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });

  it('does not auto-open when autoOpenDisabled is true', async () => {
    getVersionMock.mockResolvedValue('1.0.11');
    storeState.hydrate.mockImplementation(async () => {
      storeState.hydrated = true;
      storeState.lastSeenVersion = '1.0.9';
      storeState.autoOpenDisabled = true;
    });
    RELEASES_VALUE.push({
      version: '1.0.11',
      date: '2026-04-14',
      summary: 's',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: true,
    });

    renderHook(() => useWhatsNew());

    await waitFor(() => {
      expect(storeState.hydrate).toHaveBeenCalled();
    });
    expect(invokeMock).not.toHaveBeenCalledWith('open_whats_new_window', expect.anything());
  });
});
