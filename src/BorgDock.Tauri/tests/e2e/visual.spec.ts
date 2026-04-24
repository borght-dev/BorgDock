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
    note: 'Flyout window entry; secondary window has no test-seed hook, so uses whatever the FlyoutApp renders unseeded.',
  },
  {
    id: 'palette',
    path: '/palette.html',
    ready: 'body',
    note: 'Command palette window entry; secondary window has no test-seed hook.',
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
    ready: 'body',
    note: 'Main window; focus-tab view not yet switchable via URL. Ready selector relaxed to body until the design lands.',
  },

  // ③ main
  {
    id: 'main-window',
    // Relaxed to `body` until PR #1-#7 lands the design. The real
    // header + PR list selectors (`header, [data-pr-list]`) are the
    // target once the main shell stabilizes — but the current shell
    // may still be repainting or repositioning when we capture, so
    // `body` keeps the pixel diff flowing as the progress signal.
    ready: 'body',
    note: 'Main window; ready relaxed to body until PR #1-#7 finalizes the header + PR list structure — tighten to `header, [data-pr-list]` then.',
  },
  {
    id: 'work-items',
    ready: 'body',
    note: 'Work Items section within main window. Today requires a button click; deferred to a follow-up that wires deep-link navigation.',
  },

  // ④ detail
  {
    id: 'pr-detail-overview',
    path: '/pr-detail.html',
    ready: 'body',
    note: 'PR detail window, Overview tab default. No test-seed hook in secondary window yet.',
  },
  {
    id: 'pr-detail-tabs',
    path: '/pr-detail.html?tab=files',
    ready: 'body',
    note: 'PR detail window with Files tab active. Query param may not be honored yet.',
  },

  // ⑤ palettes & code
  {
    id: 'file-palette',
    path: '/file-palette.html',
    ready: 'body',
    note: 'Files picker palette; secondary window, no seed hook.',
  },
  {
    id: 'file-viewer',
    path: '/file-viewer.html',
    ready: 'body',
    note: 'Single-file viewer window; secondary window, no seed hook.',
  },
  {
    id: 'sql',
    path: '/sql.html',
    ready: 'body',
    note: 'SQL runner window; secondary window, no seed hook.',
  },

  // ⑥ worktree changes & diff viewer
  {
    id: 'worktree-changes',
    path: '/worktree.html',
    ready: 'body',
    note: 'Worktree changes window; secondary window, no seed hook.',
  },
  {
    id: 'diff-viewer',
    path: '/pr-detail.html?tab=files&diff=1',
    ready: 'body',
    note: 'Diff viewer view of PR detail. Query params may not route yet.',
  },

  // ⑦ settings, wizard, notifications
  {
    id: 'settings',
    ready: 'body',
    note: 'Settings flyout within main window. Requires a click to open today — deferred.',
  },
  {
    id: 'wizard',
    ready: 'body',
    note: 'Setup wizard; normally shown when setupComplete=false. injectCompletedSetup skips it today, so this baseline will diff heavily until deep-link via query param lands.',
  },
  {
    id: 'toasts',
    ready: 'body',
    note: 'Toast stack rendered on top of main window; requires a test-toast call to populate.',
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
