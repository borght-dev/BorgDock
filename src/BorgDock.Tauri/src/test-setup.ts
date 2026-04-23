import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// @testing-library/dom's waitFor detects fake timers only when a `jest` global
// exists (it probes `typeof jest` in helpers.js). Without this, `waitFor`
// hangs under `vi.useFakeTimers()` because its internal setInterval/setTimeout
// polls are themselves patched by the fake timers. Expose a tiny `vi`-backed
// bridge so the detection succeeds and it calls `jest.advanceTimersByTime`.
// See: https://github.com/testing-library/react-testing-library/issues/1197
if (typeof globalThis !== 'undefined' && !(globalThis as unknown as { jest?: unknown }).jest) {
  (globalThis as unknown as { jest: { advanceTimersByTime: (ms: number) => void } }).jest = {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  };
}

// Polyfill matchMedia for jsdom
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Polyfill scrollIntoView for jsdom
if (typeof window !== 'undefined') {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
}

afterEach(() => {
  cleanup();
});
