import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types';

type EffectiveTheme = 'light' | 'dark';

interface UseThemeReturn {
  theme: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
}

function getSystemPreference(): EffectiveTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveEffectiveTheme(mode: ThemeMode): EffectiveTheme {
  return mode === 'system' ? getSystemPreference() : mode;
}

function applyTheme(effective: EffectiveTheme) {
  if (effective === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme(initial: ThemeMode = 'system'): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemeMode>(initial);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(
    resolveEffectiveTheme(initial),
  );

  const updateEffective = useCallback((mode: ThemeMode) => {
    const effective = resolveEffectiveTheme(mode);
    setEffectiveTheme(effective);
    applyTheme(effective);
  }, []);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode);
      updateEffective(mode);
    },
    [updateEffective],
  );

  // Sync when the external setting changes
  useEffect(() => {
    setThemeState(initial);
    updateEffective(initial);
  }, [initial, updateEffective]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        updateEffective('system');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, updateEffective]);

  // Apply theme on mount
  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Try Tauri window theme detection
  useEffect(() => {
    if (theme !== 'system') return;

    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const tauriTheme = await getCurrentWindow().theme();
        if (!cancelled && tauriTheme) {
          const effective: EffectiveTheme = tauriTheme === 'dark' ? 'dark' : 'light';
          setEffectiveTheme(effective);
          applyTheme(effective);
        }
      } catch {
        // Not in Tauri context — matchMedia fallback already applied
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [theme]);

  return {
    theme,
    effectiveTheme,
    setTheme,
    isDark: effectiveTheme === 'dark',
  };
}
