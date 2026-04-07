/**
 * Helper for async Tauri plugin-store persistence.
 * Keeps the dynamic import out of Zustand store actions.
 */

export async function persistToTauriStore(
  storeName: string,
  key: string,
  value: unknown,
): Promise<void> {
  const { load } = await import('@tauri-apps/plugin-store');
  const store = await load(storeName);
  await store.set(key, value);
  await store.save();
}

export async function readFromTauriStore<T>(
  storeName: string,
  key: string,
): Promise<T | undefined> {
  const { load } = await import('@tauri-apps/plugin-store');
  const store = await load(storeName);
  return store.get<T>(key);
}
