// src/test-support/story-themes.tsx
//
// Storybook harness that renders a story in both themes side by side. The
// `.dark` tokens are scoped to a class, so wrapping one panel in `.dark`
// renders the graphite set next to the porcelain one without touching
// <html>; stories using it pin the toolbar theme to light so the left panel
// really is light.

import clsx from 'clsx';
import type { ReactNode } from 'react';

export function ThemePanel({ dark, children }: { dark?: boolean; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'flex-1 bg-[var(--color-background)] p-6 text-[13px] text-[var(--color-text-primary)]',
        dark && 'dark',
      )}
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="mb-4 text-[12px] font-medium text-[var(--color-text-tertiary)]">
        {dark ? 'Dark (graphite)' : 'Light (porcelain)'}
      </div>
      {children}
    </div>
  );
}

export function BothThemes({ children }: { children: () => ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <ThemePanel>{children()}</ThemePanel>
      <ThemePanel dark>{children()}</ThemePanel>
    </div>
  );
}
