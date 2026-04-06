import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
