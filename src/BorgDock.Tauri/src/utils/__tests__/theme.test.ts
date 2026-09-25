import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeMode } from '@/types/settings';

const listeners = new Map<string, (e: { payload: unknown }) => void>();
const unlisten = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (channel: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(channel, cb);
    return unlisten;
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import {
  applyTheme,
  currentTheme,
  REDUCE_MOTION_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  startWindowTheme,
  THEME_STORAGE_KEY,
  updateTheme,
  watchSystemTheme,
} from '../theme';

let osDark = false;
let mediaHandlers: Array<() => void> = [];

function mockOs(dark: boolean) {
  osDark = dark;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(prefers-color-scheme: dark)' ? osDark : false,
        media: query,
        addEventListener: (_: string, h: () => void) => mediaHandlers.push(h),
        removeEventListener: (_: string, h: () => void) => {
          mediaHandlers = mediaHandlers.filter((x) => x !== h);
        },
      }) as unknown as MediaQueryList,
  );
}

function html() {
  return document.documentElement;
}

function resetHtml() {
  html().classList.remove('dark', 'reduce-motion');
  html().style.colorScheme = '';
  localStorage.clear();
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mediaHandlers = [];
  listeners.clear();
  unlisten.mockClear();
  resetHtml();
  mockOs(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetHtml();
});

describe('resolveTheme', () => {
  it('returns explicit modes as they are', () => {
    mockOs(true);
    expect(resolveTheme('light')).toBe('light');
    mockOs(false);
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('follows the OS for system and for a missing value', () => {
    mockOs(true);
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme(undefined)).toBe('dark');
    mockOs(false);
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme(null)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets dark, reduce-motion and color-scheme from the UI settings', () => {
    expect(applyTheme({ theme: 'dark', reduceMotion: true })).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);
    expect(html().classList.contains('reduce-motion')).toBe(true);
    expect(html().style.colorScheme).toBe('dark');

    expect(applyTheme({ theme: 'light', reduceMotion: false })).toBe('light');
    expect(html().classList.contains('dark')).toBe(false);
    expect(html().classList.contains('reduce-motion')).toBe(false);
    expect(html().style.colorScheme).toBe('light');
  });

  it('accepts the full settings object', () => {
    applyTheme({ ui: { theme: 'dark', reduceMotion: false } });
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('treats missing settings as system with motion on', () => {
    mockOs(true);
    html().classList.add('reduce-motion');
    expect(applyTheme(undefined)).toBe('dark');
    expect(html().classList.contains('reduce-motion')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('remembers the setting (not the resolved theme) for the pre-paint script', () => {
    mockOs(true);
    applyTheme({ theme: 'system', reduceMotion: true });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe('1');
    expect(readStoredTheme()).toEqual({ theme: 'system', reduceMotion: true });
  });
});

describe('updateTheme', () => {
  it('keeps a value the update leaves out (a flyout payload without reduceMotion)', () => {
    applyTheme({ theme: 'light', reduceMotion: true });
    updateTheme({ theme: 'dark' });
    expect(html().classList.contains('dark')).toBe(true);
    expect(html().classList.contains('reduce-motion')).toBe(true);
    expect(currentTheme()).toEqual({ theme: 'dark', reduceMotion: true });
  });
});

describe('watchSystemTheme', () => {
  it('reports OS changes until unsubscribed', () => {
    const seen: string[] = [];
    const stop = watchSystemTheme((t) => seen.push(t));
    mockOs(true);
    for (const h of mediaHandlers) h();
    expect(seen).toEqual(['dark']);
    stop();
    expect(mediaHandlers).toHaveLength(0);
  });
});

describe('startWindowTheme', () => {
  it('applies the loaded settings and follows settings:ui-changed', async () => {
    const stop = startWindowTheme({ load: async () => ({ theme: 'dark', reduceMotion: false }) });
    await flush();
    expect(html().classList.contains('dark')).toBe(true);

    listeners.get('settings:ui-changed')?.({ payload: { theme: 'light', reduceMotion: true } });
    expect(html().classList.contains('dark')).toBe(false);
    expect(html().classList.contains('reduce-motion')).toBe(true);

    stop();
    expect(unlisten).toHaveBeenCalled();
    listeners.get('settings:ui-changed')?.({ payload: { theme: 'dark' } });
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('follows the OS only while the theme is system', async () => {
    const stop = startWindowTheme({ load: async () => ({ theme: 'system' }) });
    await flush();
    expect(html().classList.contains('dark')).toBe(false);
    mockOs(true);
    for (const h of mediaHandlers) h();
    expect(html().classList.contains('dark')).toBe(true);

    listeners.get('settings:ui-changed')?.({ payload: { theme: 'light' } });
    for (const h of mediaHandlers) h();
    expect(html().classList.contains('dark')).toBe(false);
    stop();
  });

  it('keeps a Settings preview when the OS switches before the save arrives', async () => {
    const stop = startWindowTheme({ load: async () => ({ theme: 'system' }) });
    await flush();
    // The Settings window previews Dark (applyTheme) before its save lands.
    applyTheme({ theme: 'dark' });
    mockOs(false);
    for (const h of mediaHandlers) h();
    expect(html().classList.contains('dark')).toBe(true);
    stop();
  });

  it('keeps the pre-paint state when the settings cannot load', async () => {
    html().classList.add('dark');
    startWindowTheme({ load: () => Promise.reject(new Error('no ipc')) })();
    await flush();
    expect(html().classList.contains('dark')).toBe(true);
  });
});

describe('public/theme-boot.js', () => {
  const script = readFileSync(resolve(__dirname, '../../../public/theme-boot.js'), 'utf8');
  const run = () => new Function(script)();

  const cases: Array<{ stored: ThemeMode | 'junk' | null; os: boolean; reduce: string | null }> = [
    { stored: 'dark', os: false, reduce: '1' },
    { stored: 'light', os: true, reduce: '0' },
    { stored: 'system', os: true, reduce: null },
    { stored: 'system', os: false, reduce: '1' },
    { stored: null, os: true, reduce: null },
    { stored: 'junk', os: false, reduce: null },
  ];

  it.each(cases)('agrees with applyTheme for %o', ({ stored, os, reduce }) => {
    mockOs(os);
    if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);
    if (reduce !== null) localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, reduce);
    run();
    const boot = {
      dark: html().classList.contains('dark'),
      reduce: html().classList.contains('reduce-motion'),
      scheme: html().style.colorScheme,
    };

    resetHtml();
    applyTheme({
      theme: stored === 'junk' || stored === null ? undefined : stored,
      reduceMotion: reduce === '1',
    });
    expect(boot).toEqual({
      dark: html().classList.contains('dark'),
      reduce: html().classList.contains('reduce-motion'),
      scheme: html().style.colorScheme,
    });
  });

  it('is what every HTML entry loads before first paint', () => {
    const root = resolve(__dirname, '../../..');
    const entries = [
      'index.html',
      'flyout.html',
      'settings.html',
      'sql.html',
      'file-palette.html',
      'file-viewer.html',
      'work-item-palette.html',
      'workitem-detail.html',
      'pr-detail.html',
      'worktree.html',
      'whats-new.html',
    ];
    for (const entry of entries) {
      const htmlText = readFileSync(resolve(root, entry), 'utf8');
      const head = htmlText.slice(0, htmlText.indexOf('</head>'));
      expect(head, entry).toContain('<script src="/theme-boot.js"></script>');
      expect(htmlText, entry).not.toContain("localStorage.getItem('borgdock-theme')");
    }
  });
});
