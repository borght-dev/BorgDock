import type { StateStorage } from 'zustand/middleware';

let warning: string | null = null;
const listeners = new Set<() => void>();
function report(value: string | null) {
  if (value === warning) return;
  warning = value;
  for (const listener of listeners) listener();
}
export const getReviewDraftStorageWarning = () => warning;
export function subscribeReviewDraftStorage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const reviewDraftStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      report('Saved drafts could not be loaded on this device.');
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      report(null);
    } catch {
      report('Drafts are only kept for this session. Device storage is unavailable.');
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      report(null);
    } catch {
      report('Saved drafts could not be removed from device storage.');
    }
  },
};
