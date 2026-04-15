import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => storeMock),
}));

import { useWhatsNewStore } from '../whats-new-store';

describe('whats-new-store', () => {
  beforeEach(() => {
    storeMock.get.mockReset();
    storeMock.set.mockReset();
    storeMock.save.mockReset();
    useWhatsNewStore.setState({
      lastSeenVersion: null,
      autoOpenDisabled: false,
      hydrated: false,
    });
  });

  it('hydrate reads both keys from tauri-plugin-store', async () => {
    storeMock.get.mockImplementation(async (key: string) => {
      if (key === 'lastSeenVersion') return '1.0.10';
      if (key === 'autoOpenDisabled') return true;
      return null;
    });
    await useWhatsNewStore.getState().hydrate();
    expect(useWhatsNewStore.getState()).toMatchObject({
      lastSeenVersion: '1.0.10',
      autoOpenDisabled: true,
      hydrated: true,
    });
  });

  it('setLastSeenVersion updates state and persists', async () => {
    await useWhatsNewStore.getState().hydrate();
    storeMock.set.mockClear();
    storeMock.save.mockClear();
    await useWhatsNewStore.getState().setLastSeenVersion('1.0.11');
    expect(useWhatsNewStore.getState().lastSeenVersion).toBe('1.0.11');
    expect(storeMock.set).toHaveBeenCalledWith('lastSeenVersion', '1.0.11');
    expect(storeMock.save).toHaveBeenCalled();
  });

  it('disableAutoOpen flips the flag and bumps lastSeenVersion', async () => {
    await useWhatsNewStore.getState().hydrate();
    storeMock.set.mockClear();
    await useWhatsNewStore.getState().disableAutoOpen('1.0.11');
    const state = useWhatsNewStore.getState();
    expect(state.autoOpenDisabled).toBe(true);
    expect(state.lastSeenVersion).toBe('1.0.11');
    expect(storeMock.set).toHaveBeenCalledWith('autoOpenDisabled', true);
    expect(storeMock.set).toHaveBeenCalledWith('lastSeenVersion', '1.0.11');
  });
});
