import { useEffect, useState } from 'react';

const STORAGE_KEY = 'prdock-theme';

/**
 * Light / dark switch. The inline script in Layout.astro applies the saved
 * theme to <html> before paint; this island only reads it after hydration
 * (so the server render and the first client render agree) and writes it
 * when clicked. Both icons are rendered and CSS shows the right one, so the
 * button never flashes the wrong icon.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark === false ? 'Switch to the dark theme' : 'Switch to the light theme'}
      title="Switch theme"
    >
      <svg
        className="theme-toggle__sun"
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M3.5 12.5L4.8 11.2M11.2 4.8l1.3-1.3" />
      </svg>
      <svg
        className="theme-toggle__moon"
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6.5 1.5A6.5 6.5 0 1 0 14.5 9.5a5 5 0 0 1-8-8z" />
      </svg>
    </button>
  );
}
