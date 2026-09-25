/**
 * Theme and reduced motion for every window (plans/ui-overhaul-workbench.md,
 * phase 6).
 *
 * One set of rules decides what <html> looks like:
 * - `.dark` when the theme setting is `dark`, or `system` and the OS prefers dark;
 * - `.reduce-motion` when the Appearance setting asks for it (styles/motion.css
 *   and `motionOK()` read it);
 * - `color-scheme` so native controls and scrollbars follow the theme.
 *
 * `applyTheme` also writes the two localStorage keys that `public/theme-boot.js`
 * reads before first paint, so a window opened later starts in the state the
 * last window applied and never flashes the other theme. Keep the storage keys
 * and the resolution rule in step with that script (a unit test checks both).
 */
import { SETTINGS_UI_CHANGED_EVENT } from '@/stores/settings-events';
import type { ThemeMode } from '@/types/settings';
import { REDUCE_MOTION_CLASS } from './motion';

export type EffectiveTheme = 'light' | 'dark';

/** The two settings that shape <html>: `ui.theme` and `ui.reduceMotion`. */
export interface ThemeSettings {
  theme?: ThemeMode;
  reduceMotion?: boolean;
}

/** `applyTheme` takes the UI slice, or an object that carries it (the full settings). */
export type ThemeInput = ThemeSettings | { ui?: ThemeSettings | null };

/** localStorage key for the theme setting (`light`, `dark` or `system`). */
export const THEME_STORAGE_KEY = 'borgdock-theme';
/** localStorage key for reduced motion (`1` or `0`). */
export const REDUCE_MOTION_STORAGE_KEY = 'borgdock-reduce-motion';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** The theme a setting resolves to right now; `system` follows the OS preference. */
export function resolveTheme(mode: ThemeMode | null | undefined): EffectiveTheme {
  if (mode === 'dark' || mode === 'light') return mode;
  return systemPrefersDark() ? 'dark' : 'light';
}

function uiOf(input: ThemeInput | null | undefined): ThemeSettings {
  if (!input) return {};
  if ('ui' in input) return input.ui ?? {};
  return input as ThemeSettings;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** What this window last applied; `null` until the first `applyTheme`. */
let lastApplied: ThemeSettings | null = null;

/**
 * Sets `.dark`, `.reduce-motion` and `color-scheme` on <html> from the theme
 * settings and remembers them for the pre-paint script. Missing values mean
 * `system` and motion on. Returns the theme that was applied.
 */
export function applyTheme(input: ThemeInput | null | undefined): EffectiveTheme {
  const ui = uiOf(input);
  const mode: ThemeMode = isThemeMode(ui.theme) ? ui.theme : 'system';
  const reduceMotion = ui.reduceMotion === true;
  const effective = resolveTheme(mode);
  lastApplied = { theme: mode, reduceMotion };

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', effective === 'dark');
    root.classList.toggle(REDUCE_MOTION_CLASS, reduceMotion);
    root.style.colorScheme = effective;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, reduceMotion ? '1' : '0');
  } catch {
    // Storage unavailable or full: the next window resolves from its settings instead.
  }
  return effective;
}

/**
 * The theme settings this window shows right now: the last `applyTheme` call
 * (a saved setting, a payload or a Settings preview), else the pre-paint state.
 */
export function currentTheme(): ThemeSettings {
  return lastApplied ?? readStoredTheme();
}

/**
 * Applies `next` on top of what the window shows now: a value `next` leaves
 * out keeps its current one (a flyout payload without `reduceMotion` does not
 * turn reduced motion off).
 */
export function updateTheme(next: ThemeSettings): EffectiveTheme {
  const current = currentTheme();
  return applyTheme({
    theme: next.theme ?? current.theme,
    reduceMotion: next.reduceMotion ?? current.reduceMotion,
  });
}

/** The last applied settings, as the pre-paint script sees them. */
export function readStoredTheme(): ThemeSettings {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    const reduce = localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
    return {
      theme: isThemeMode(theme) ? theme : 'system',
      reduceMotion: reduce === '1',
    };
  } catch {
    return { theme: 'system', reduceMotion: false };
  }
}

/**
 * Calls `onChange` with the OS theme whenever the OS switches between light and
 * dark. Returns the unsubscribe function.
 */
export function watchSystemTheme(onChange: (theme: EffectiveTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  if (typeof query?.addEventListener !== 'function') return () => {};
  const handler = () => onChange(resolveTheme('system'));
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

async function loadUiSettings(): Promise<ThemeSettings | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const settings = await invoke<{ ui?: ThemeSettings } | null>('load_settings');
  return settings?.ui ?? null;
}

export interface StartWindowThemeOptions {
  /** Reads the saved UI settings. Defaults to the `load_settings` command. */
  load?: () => Promise<ThemeSettings | null | undefined>;
}

/**
 * Keeps a window's <html> in step with the theme settings for its lifetime:
 * applies the saved settings once they load, re-applies when any window saves
 * new UI settings (`settings:ui-changed`), and follows the OS while the theme
 * is `system`. Every tool window's entry calls it once, before React mounts;
 * until the settings load, the pre-paint script's state stands. Returns a
 * function that stops listening.
 */
export function startWindowTheme(options: StartWindowThemeOptions = {}): () => void {
  let stopped = false;
  let unlisten: (() => void) | undefined;

  const apply = (next: ThemeSettings | null | undefined) => {
    if (stopped || !next) return;
    updateTheme(next);
  };

  // Re-applies what the window shows now, so a Settings preview or a flyout
  // payload applied since the last load is what follows the OS.
  const stopWatching = watchSystemTheme(() => {
    const current = currentTheme();
    if (!stopped && (current.theme ?? 'system') === 'system') applyTheme(current);
  });

  (options.load ?? loadUiSettings)()
    .then(apply)
    .catch(() => {
      // No settings (tests, Storybook, a failed read): keep the pre-paint state.
    });

  import('@tauri-apps/api/event')
    .then(({ listen }) => listen<ThemeSettings>(SETTINGS_UI_CHANGED_EVENT, (e) => apply(e.payload)))
    .then((fn) => {
      if (stopped) fn();
      else unlisten = fn;
    })
    .catch(() => {
      // No Tauri event bridge: nothing else can change the settings.
    });

  return () => {
    stopped = true;
    stopWatching();
    unlisten?.();
  };
}
