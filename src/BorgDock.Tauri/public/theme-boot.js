/*
 * Pre-paint theme for every BorgDock window. Loaded as a classic (blocking)
 * script from each HTML entry's <head>, so <html> has its theme and motion
 * classes before the first paint and no window flashes the other theme while
 * React and the settings load.
 *
 * Same rules and storage keys as applyTheme() in src/utils/theme.ts, which
 * writes these keys every time a window applies the settings:
 *   borgdock-theme          'light' | 'dark' | 'system' (anything else = system)
 *   borgdock-reduce-motion  '1' puts .reduce-motion on <html>
 * src/utils/__tests__/theme.test.ts runs this file against applyTheme().
 *
 * Served from public/ (not inline) so Tauri's CSP hashing and nonces never
 * apply to it; script-src 'self' covers it.
 */
(function () {
  try {
    var root = document.documentElement;
    var mode = localStorage.getItem('borgdock-theme');
    var dark =
      mode === 'dark' ||
      (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.classList.toggle('reduce-motion', localStorage.getItem('borgdock-reduce-motion') === '1');
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* No storage or matchMedia: the window applies its settings once they load. */
  }
})();
