import { create } from 'zustand';
import { createLogger } from '@/services/logger';

const log = createLogger('whats-new-store');

interface State {
  lastSeenVersion: string | null;
  autoOpenDisabled: boolean;
  hydrated: boolean;
}

interface Actions {
  hydrate(): Promise<void>;
  setLastSeenVersion(version: string): Promise<void>;
  disableAutoOpen(currentVersion: string): Promise<void>;
}

async function getStore() {
  const { load } = await import('@tauri-apps/plugin-store');
  return load('whats-new-state.json');
}

export const useWhatsNewStore = create<State & Actions>((set, get) => ({
  lastSeenVersion: null,
  autoOpenDisabled: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const store = await getStore();
      const lastSeenVersion = (await store.get<string>('lastSeenVersion')) ?? null;
      const autoOpenDisabled = (await store.get<boolean>('autoOpenDisabled')) ?? false;
      set({ lastSeenVersion, autoOpenDisabled, hydrated: true });
    } catch (err) {
      log.warn('hydrate failed — starting with defaults', err);
      set({ hydrated: true });
    }
  },

  setLastSeenVersion: async (version) => {
    set({ lastSeenVersion: version });
    try {
      const store = await getStore();
      await store.set('lastSeenVersion', version);
      await store.save();
    } catch (err) {
      log.warn('setLastSeenVersion persist failed', err);
    }
  },

  disableAutoOpen: async (currentVersion) => {
    set({ autoOpenDisabled: true, lastSeenVersion: currentVersion });
    try {
      const store = await getStore();
      await store.set('autoOpenDisabled', true);
      await store.set('lastSeenVersion', currentVersion);
      await store.save();
    } catch (err) {
      log.warn('disableAutoOpen persist failed', err);
    }
  },
}));
