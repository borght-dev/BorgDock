// .storybook/mocks/tauri-plugin-store.ts
//
// Drop-in replacement for @tauri-apps/plugin-store. Map-backed and
// keyed per file path so multiple windows storying different store
// files don't collide. save() is a no-op (in-memory).
//
// pluginStoreBehavior on the control surface lets stories assert
// the Hydrating ('pending') and StoreHydrationFailed ('reject')
// states without touching production code.

import { getControl } from './control';

interface MockStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export async function load(path: string): Promise<MockStore> {
  const ctrl = getControl();

  if (ctrl.pluginStoreBehavior === 'pending') {
    // Never resolves — used by the Hydrating story to freeze the
    // pre-hydration UI.
    return new Promise<MockStore>(() => {});
  }
  if (ctrl.pluginStoreBehavior === 'reject') {
    throw new Error('storybook: plugin-store unavailable');
  }

  let bag = ctrl.pluginStore.get(path);
  if (!bag) {
    bag = new Map();
    ctrl.pluginStore.set(path, bag);
  }
  const owned = bag;
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return owned.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      owned.set(key, value);
    },
    async save(): Promise<void> {
      // no-op
    },
  };
}
