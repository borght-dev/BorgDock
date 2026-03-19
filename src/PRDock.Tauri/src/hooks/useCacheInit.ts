import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

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
