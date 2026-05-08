import { test } from '@playwright/test';
import { bootApp } from './helpers/test-utils';

/**
 * Per-window render smoke. Asserts:
 *   - bootApp completes (page goto, mocks installed, app-ready attr seen)
 *   - no console.error during boot
 *   - no unhandled rejections / page errors
 *
 * Iterates the 12 HTML entries from vite.config.ts:rollupOptions.input.
 * Adding a new window: add the entry path here, add data-app-ready to
 * the new App.tsx root.
 */

const ENTRIES: { name: string; path: string }[] = [
  { name: 'main', path: '' },
  { name: 'flyout', path: 'flyout.html' },
  { name: 'work-item-palette', path: 'work-item-palette.html' },
  { name: 'workitem-detail', path: 'workitem-detail.html' },
  { name: 'pr-detail', path: 'pr-detail.html' },
  { name: 'sql', path: 'sql.html' },
  { name: 'worktree', path: 'worktree.html' },
  { name: 'whats-new', path: 'whats-new.html' },
  { name: 'file-palette', path: 'file-palette.html' },
  { name: 'file-viewer', path: 'file-viewer.html' },
  { name: 'agent-overview', path: 'agent-overview.html' },
  { name: 'settings', path: 'settings.html' },
];

for (const { name, path } of ENTRIES) {
  test(`${name} renders without console errors`, async ({ page }) => {
    await bootApp(page, path, 'happy-path');
  });
}
