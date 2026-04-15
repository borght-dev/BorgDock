import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeMode } from '@/types';
import { useTheme } from '../useTheme';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    theme: vi.fn().mockResolvedValue(null),
  })),
}));

describe('useTheme', () => {
  let matchMediaListeners: Array<() => void>;
  let matchMediaMatches: boolean;

  beforeEach(() => {
    matchMediaListeners = [];
    matchMediaMatches = false;
    document.documentElement.classList.remove('dark');

    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: matchMediaMatches,
          addEventListener: (_event: string, handler: () => void) => {
            matchMediaListeners.push(handler);
          },
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies dark class when initial is "dark"', () => {
    renderHook(() => useTheme('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when initial is "light"', () => {
    document.documentElement.classList.add('dark');
    renderHook(() => useTheme('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('returns correct theme and effectiveTheme for explicit mode', () => {
    const { result } = renderHook(() => useTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(result.current.effectiveTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('returns isDark false for light mode', () => {
    const { result } = renderHook(() => useTheme('light'));
    expect(result.current.isDark).toBe(false);
    expect(result.current.effectiveTheme).toBe('light');
  });

  it('uses system preference when initial is "system"', () => {
    matchMediaMatches = true;
    // Re-mock to update the matches value
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: true,
          addEventListener: (_event: string, handler: () => void) => {
            matchMediaListeners.push(handler);
          },
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => useTheme('system'));
    expect(result.current.theme).toBe('system');
    expect(result.current.effectiveTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('setTheme updates theme and applies DOM class', () => {
    const { result } = renderHook(() => useTheme('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.effectiveTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('responds to OS theme changes in system mode', () => {
    matchMediaMatches = false;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: matchMediaMatches,
          addEventListener: (_event: string, handler: () => void) => {
            matchMediaListeners.push(handler);
          },
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => useTheme('system'));
    expect(result.current.effectiveTheme).toBe('light');

    // Simulate OS theme change to dark
    matchMediaMatches = true;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    act(() => {
      for (const listener of matchMediaListeners) {
        listener();
      }
    });

    expect(result.current.effectiveTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not respond to OS theme changes when not in system mode', () => {
    const { result } = renderHook(() => useTheme('light'));

    // Even if matchMedia fires, it should stay light
    matchMediaMatches = true;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    act(() => {
      for (const listener of matchMediaListeners) {
        listener();
      }
    });

    expect(result.current.effectiveTheme).toBe('light');
  });

  it('syncs when the external initial prop changes', () => {
    const { result, rerender } = renderHook(({ initial }) => useTheme(initial), {
      initialProps: { initial: 'light' as ThemeMode },
    });

    expect(result.current.theme).toBe('light');

    rerender({ initial: 'dark' as ThemeMode });
    expect(result.current.theme).toBe('dark');
    expect(result.current.effectiveTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('defaults to system when no argument', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('cleans up matchMedia listener on unmount', () => {
    const removeEventListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener,
        }) as unknown as MediaQueryList,
    );

    const { unmount } = renderHook(() => useTheme('system'));
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });
});
