import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types';
import { REDUCE_MOTION_CLASS } from '../utils/motion';
import { applyTheme, type EffectiveTheme, resolveTheme, watchSystemTheme } from '../utils/theme';

interface UseThemeReturn {
  theme: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
}

export interface UseThemeOptions {
  /** The `ui.reduceMotion` setting. Toggles `.reduce-motion` on <html> (see styles/motion.css). */
  reduceMotion?: boolean;
  /**
   * False until the settings have loaded. Until then nothing is applied or
   * stored, so the state public/theme-boot.js set before first paint survives
   * the splash instead of flipping to the defaults and back. Default true.
   */
  enabled?: boolean;
}

/**
 * The main window's theme: applies `ui.theme` and `ui.reduceMotion` to <html>
 * through `applyTheme` (src/utils/theme.ts, shared with every tool window) and
 * follows the OS while the theme is `system`.
 */
export function useTheme(
  initial: ThemeMode = 'system',
  options: UseThemeOptions = {},
): UseThemeReturn {
  const reduceMotion = options.reduceMotion ?? false;
  const enabled = options.enabled ?? true;
  const [theme, setThemeState] = useState<ThemeMode>(initial);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => resolveTheme(initial));

  // Sync when the external setting changes.
  useEffect(() => {
    setThemeState(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled) return;
    setEffectiveTheme(applyTheme({ theme, reduceMotion }));
  }, [enabled, theme, reduceMotion]);

  // Follow OS theme changes while in system mode.
  useEffect(() => {
    if (!enabled || theme !== 'system') return;
    return watchSystemTheme(() => setEffectiveTheme(applyTheme({ theme, reduceMotion })));
  }, [enabled, theme, reduceMotion]);

  // Reduced motion belongs to the mounted app; drop it when the app goes.
  useEffect(() => () => document.documentElement.classList.remove(REDUCE_MOTION_CLASS), []);

  const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);

  return {
    theme,
    effectiveTheme,
    setTheme,
    isDark: effectiveTheme === 'dark',
  };
}
