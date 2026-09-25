import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveReady: () => void = () => {};
const invoke = vi.fn(() => new Promise<void>((r) => (resolveReady = r)));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...(args as [])),
}));

import {
  playWindowEnter,
  revealWindow,
  WINDOW_ENTER_CLASS,
  WINDOW_PENDING_CLASS,
} from '../window-reveal';

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' ? reduce : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  invoke.mockClear();
  mockReducedMotion(false);
});

afterEach(() => {
  root.remove();
  vi.restoreAllMocks();
});

describe('revealWindow', () => {
  it('holds the first frame until window_ready resolves, then plays the entrance', async () => {
    const done = revealWindow();
    expect(invoke).toHaveBeenCalledWith('window_ready');
    expect(root.classList.contains(WINDOW_PENDING_CLASS)).toBe(true);
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(false);

    resolveReady();
    await done;
    expect(root.classList.contains(WINDOW_PENDING_CLASS)).toBe(false);
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(true);

    root.dispatchEvent(new Event('animationend'));
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(false);
  });

  it('still reveals when window_ready fails', async () => {
    invoke.mockImplementationOnce(() => Promise.reject(new Error('no ipc')));
    await revealWindow();
    expect(root.classList.contains(WINDOW_PENDING_CLASS)).toBe(false);
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(true);
  });

  it('adds nothing under reduced motion', async () => {
    mockReducedMotion(true);
    const done = revealWindow();
    expect(root.classList.contains(WINDOW_PENDING_CLASS)).toBe(false);
    resolveReady();
    await done;
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(false);
  });
});

describe('playWindowEnter', () => {
  it('plays once per window', () => {
    playWindowEnter();
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(true);
    root.dispatchEvent(new Event('animationend'));
    playWindowEnter();
    expect(root.classList.contains(WINDOW_ENTER_CLASS)).toBe(false);
  });
});
