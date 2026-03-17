import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useCacheInit() {
  useEffect(() => {
    (async () => {
      try {
        await invoke('cache_init');
      } catch (err) {
        console.error('Failed to initialize cache:', err);
      }
    })();
  }, []);
}
