import { useEffect, useState } from 'react';

const STORAGE_KEY = 'prdock-theme';

export default function ThemeToggle() {
  // Initialise from the <html> class — the inline <script> in Layout.astro has
  // already applied the persisted value before hydration, so this mirrors
  // whatever is currently on the DOM.
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'transparent',
        border: '1px solid var(--color-subtle-border)',
        color: 'var(--color-text-tertiary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {dark ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M3.5 12.5L4.8 11.2M11.2 4.8l1.3-1.3" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M6.5 1.5A6.5 6.5 0 1 0 14.5 9.5a5 5 0 0 1-8-8z" />
        </svg>
      )}
    </button>
  );
}
