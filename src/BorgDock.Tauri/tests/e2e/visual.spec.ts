import { expect, test } from '@playwright/test';
import { injectCompletedSetup } from './helpers/test-utils';
import {
  seedDesignFixturesIfAvailable,
  setTheme,
} from './helpers/seed';
import { DEFAULT_TOLERANCE, VISUAL_TOLERANCES } from './visual-tolerances';

/**
 * Visual regression: each surface × theme is compared against the
 * baseline captured by `tests/e2e/scripts/capture-design-baselines.spec.ts`.
 * The baselines live at `__screenshots__/<projectName>/design/<id>-<theme>.png`
 * thanks to the shared `snapshotPathTemplate` in `playwright.config.ts`
 * and the `['design', <name>]` tuple passed to `toHaveScreenshot`.
 *
 * Expected outcome on this PR (#0): MOST tests fail with a pixel-diff
 * error. That is by design — `visual.spec.ts` is the progress tracker
 * for PR #1-#7's work. The only "real" bugs to fix in this task are:
 *   - 404s (path wrong in SURFACES)
 *   - "locator not found" errors (ready-selector unresolvable)
 *   - seed-hook errors (DEV build or App.tsx not loaded)
 * A red screenshot diff is the intended signal.
 *
 * Navigation notes:
 *   - Main-window variants (`focus-tab`, `main-window`, `work-items`,
 *     `settings`, `wizard`, `toasts`, `worktree-changes` when the
 *     streamlined app inlines it) currently share `/` as their entry.
 *     Deep navigation to individual sections/modals isn't wired into
 *     this spec yet — each surface mounts the main shell and relies on
 *     the future design implementation to switch views based on the
 *     seeded state. For now the pixel diffs will be large; Task 24
 *     will audit and tighten.
 *   - Secondary window HTML entries (`flyout.html`, `palette.html`,
 *     `pr-detail.html`, `sql.html`, `file-palette.html`,
 *     `file-viewer.html`, `worktree.html`) come from
 *     `vite.config.ts:rollupOptions.input`.
 *   - `badges` has NO matching HTML entry (there's no `badge.html` in
 *     the current app). We mount `flyout.html` — the nearest
 *     tray-adjacent surface — and document that the pixel diff will be
 *     unrepresentative until the streamlined design emits a real
 *     floating-badge entry point.
 */

type Surface = {
  /** Baseline ID — MUST match Task 7's ARTBOARDS inventory exactly. */
  id: string;
  /** URL path relative to baseURL. Omit for main window at `/`. */
  path?: string;
  /**
   * Selector to wait for before screenshot. If the selector doesn't
   * exist in the current app yet, use `body` (the test must RUN even
   * if the pixel comparison would fail — failing diffs are signal,
   * failing test setup is noise).
   */
  ready: string;
  /** Optional selector to clip the screenshot to (default: full page). */
  clipTo?: string;
  /** Surfaces that only have a dark baseline (e.g. `badges`). */
  darkOnly?: boolean;
  /** Free-form note surfaced in `tests-audit` (Task 24). */
  note?: string;
};

/**
 * SURFACES must match Task 7's ARTBOARDS 1:1. Any id drift breaks the
 * baseline lookup (filename-level). Keep comments aligned with the
 * capture spec's section headers for ease of diffing.
 */
const SURFACES: Surface[] = [
  // ① system
  {
    id: 'flyout',
    path: '/flyout.html',
    ready: 'body',
    note: 'Flyout window entry; FlyoutApp and its sub-components (FlyoutGlance, FlyoutInitializing) have no data-tauri-drag-region — falls back to body until the attribute is added in a follow-up PR.',
  },
  {
    id: 'palette',
    path: '/palette.html',
    ready: '[data-tauri-drag-region]',
    note: 'Command palette window; PaletteApp drag-handle has data-tauri-drag-region so this fails fast if PaletteApp errors during mount.',
  },
  {
    id: 'badges',
    path: '/flyout.html',
    ready: 'body',
    darkOnly: true,
    note: 'No badge.html exists today — falls back to flyout.html. Pixel diff will be unrepresentative until a dedicated badge entry lands.',
  },

  // ② focus
  {
    id: 'focus-tab',
    path: '/?section=focus',
    ready: '[data-section="focus"]',
    note: 'Main window with Focus section forced via ?section=focus URL deep-link (PR #9). Header reads URLSearchParams on mount and dispatches setActiveSection.',
  },

  // ③ main
  {
    id: 'main-window',
    ready: 'header',
    note: 'Main window; <header> renders unconditionally via Sidebar — tighter than body, defers to PR #9 for deep PR-list selector.',
  },
  {
    id: 'work-items',
    path: '/?section=work-items',
    ready: '[data-section="workitems"]',
    note: 'Main window with Work Items section forced via ?section=work-items URL deep-link (PR #9). Note: URL param is kebab-case, store value is concatenated.',
  },

  // ④ detail
  {
    id: 'pr-detail-overview',
    path: '/pr-detail.html',
    ready: '[data-tauri-drag-region]',
    note: 'PR detail window, Overview tab default; PRDetailApp titlebar has data-tauri-drag-region so this fails fast if PRDetailApp errors during mount.',
  },
  {
    id: 'pr-detail-tabs',
    path: '/pr-detail.html?tab=files',
    ready: '[data-tauri-drag-region]',
    note: 'PR detail window with Files tab active; same titlebar drag-region as pr-detail-overview.',
  },

  // ⑤ palettes & code
  {
    id: 'file-palette',
    path: '/file-palette.html',
    ready: '[data-tauri-drag-region]',
    note: 'Files picker palette; FilePaletteApp titlebar has data-tauri-drag-region so this fails fast if the app errors during mount.',
  },
  {
    id: 'file-viewer',
    path: '/file-viewer.html',
    ready: '[data-tauri-drag-region]',
    note: 'Single-file viewer window; FileViewerToolbar has data-tauri-drag-region so this fails fast if the app errors during mount.',
  },
  {
    id: 'sql',
    path: '/sql.html',
    ready: '[data-tauri-drag-region]',
    note: 'SQL runner window; SqlApp uses WindowTitleBar which has data-tauri-drag-region so this fails fast if SqlApp errors during mount.',
  },

  // ⑥ worktree changes & diff viewer
  {
    id: 'worktree-changes',
    path: '/worktree.html',
    ready: '[data-tauri-drag-region]',
    clipTo: '.bd-wt-palette',
    note: 'Worktree changes window; clipped to .bd-wt-palette to exclude scrollbars and any debug overlays.',
  },
  {
    id: 'diff-viewer',
    path: '/pr-detail.html?tab=files&diff=1',
    ready: '[data-tauri-drag-region]',
    note: 'Diff viewer view of PR detail; same PRDetailApp titlebar drag-region as pr-detail-overview.',
  },

  // ⑦ settings, wizard, notifications
  {
    id: 'settings',
    path: '/?settings=open',
    ready: '[data-flyout="settings"]',
    note: 'Settings flyout opened via ?settings=open URL deep-link (PR #9). App.tsx mount effect calls useUiStore.setSettingsOpen(true) when the param is present.',
  },
  {
    id: 'wizard',
    path: '/?wizard=force',
    ready: '[data-wizard-step]',
    note: 'Setup wizard forced via ?wizard=force URL deep-link (PR #9). App.tsx forceWizardFromUrl short-circuits the needsSetup gate; the dev/test guard prevents production bundles from honoring it.',
  },
  {
    id: 'toasts',
    path: '/?toast=test',
    ready: '[data-toast]',
    note: 'Synthetic test toast pushed via ?toast=test URL deep-link (PR #9). NotificationOverlay mount effect calls useNotificationStore.show() with severity:info.',
  },
];

// Sanity: SURFACES light+dark = 31 to match the 31 baselines on disk.
const expectedTests = SURFACES.reduce(
  (sum, s) => sum + (s.darkOnly ? 1 : 2),
  0,
);
// This runs at import time — catches accidental SURFACES edits that
// drift from the 31 captured baselines.
if (expectedTests !== 31) {
  throw new Error(
    `visual.spec.ts expected 31 test cases (15 L+D pairs + 1 dark-only), got ${expectedTests}. ` +
      `SURFACES drifted from Task 7's ARTBOARDS — reconcile with tests/e2e/scripts/capture-design-baselines.spec.ts.`,
  );
}

for (const surface of SURFACES) {
  const themes: Array<'light' | 'dark'> = surface.darkOnly
    ? ['dark']
    : ['light', 'dark'];
  for (const theme of themes) {
    test(`visual: ${surface.id} (${theme})`, async ({ page }) => {
      await injectCompletedSetup(page);
      await page.goto(surface.path ?? '/');

      // Intentionally NOT using `waitForAppReady` — it waits for
      // `header, [class*="fixed inset-0"]`, and any error boundary
      // that catches a render-time exception leaves us stuck on that
      // selector until timeout. The whole point of this spec is to
      // capture a pixel frame even when the shell is broken — the
      // pixel diff becomes the signal that PR #1-#7 needs to fix it.
      await page.waitForLoadState('domcontentloaded');

      await setTheme(page, theme);

      // Seed the main window when possible; secondary windows don't
      // install the test-seed hook today and should no-op rather than
      // erroring so the test still captures a pixel frame.
      await seedDesignFixturesIfAvailable(page);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });

      await page
        .locator(surface.ready)
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 });

      const tolerance =
        VISUAL_TOLERANCES[surface.id] ?? DEFAULT_TOLERANCE;

      // Tuple form keeps the `design/` segment as a real subdirectory
      // in the snapshot path (Playwright sanitizes `/` to `-` when the
      // name is a single string — see capture-design-baselines.spec.ts
      // for the matching pattern).
      const snapshotName: readonly [string, string] = [
        'design',
        `${surface.id}-${theme}.png`,
      ];

      const target = surface.clipTo
        ? page.locator(surface.clipTo).first()
        : page;

      await expect(target).toHaveScreenshot(snapshotName, {
        maxDiffPixelRatio: tolerance,
        animations: 'disabled',
      });
    });
  }
}
