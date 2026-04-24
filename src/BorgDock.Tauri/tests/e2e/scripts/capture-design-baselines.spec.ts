import { test, expect } from '@playwright/test';

/**
 * Runs once to capture (and re-capture) every artboard in the frozen
 * design canvas as a per-surface PNG under
 * `__screenshots__/<project>/design/<surface>-<theme>.png`.
 *
 * Triggered via: `npm run test:e2e:capture-design` (which passes
 * --update-snapshots). Running without --update-snapshots turns this
 * into a drift check — useful in CI to notice if someone edited the
 * design bundle without reviewing the PNG churn.
 *
 * Navigation: the design bundle is served over HTTP by the second
 * `webServer` entry in `playwright.config.ts` (http-server on :1421).
 * We cannot use `file://` — the bundle's HTML loads sibling `.jsx`
 * files via `<script type="text/babel" src="...">`, and Babel's
 * in-browser transformer XHR-fetches them, which Chromium blocks
 * under `file://` (only chrome/data/http/https schemes allowed).
 *
 * Targeting strategy: the vendored `design-canvas.jsx` already stamps
 * each artboard root with `data-dc-slot="<id>"` (see
 * DCArtboardFrame). `LightDarkPair id="X"` expands to two artboards,
 * one with slot `X` (light) and one with slot `X-dark` wrapped in a
 * `.dark` class scope (see BorgDock - Streamlined.html). No HTML edit
 * is needed — we use the existing attribute directly.
 */

// Served by the static http-server webServer defined in
// playwright.config.ts. Note the URL-encoded space in the filename.
const DESIGN_URL =
  'http://localhost:1421/borgdock/project/BorgDock%20-%20Streamlined.html';

type Artboard = {
  /** Stable surface id — used in the snapshot filename. */
  id: string;
  /**
   * CSS selector for the artboard root, must resolve to exactly one element.
   *
   * NOTE: `data-dc-slot` is emitted by the `DCArtboardFrame` React
   * component at runtime (see `design-bundle/borgdock/project/
   * design-canvas.jsx` around line 467). A `grep` of the static HTML
   * will find zero matches — that's expected. The attribute is only
   * present after JS runs, which is fine for Playwright's navigation.
   */
  selector: string;
  /** Theme scope of the artboard (light or dark). */
  theme: 'light' | 'dark';
};

/**
 * Faithful inventory of what actually exists in the frozen canvas
 * (BorgDock - Streamlined.html, 2026-04-23 bundle). Do not add entries
 * for surfaces that aren't drawn — the capture would fail.
 *
 * Sections (from the HTML):
 *   ① system   — flyout, palette, badges (badges is dark-only, no pair)
 *   ② focus    — focus-tab
 *   ③ main     — main-window, work-items
 *   ④ detail   — pr-detail-overview, pr-detail-tabs
 *   ⑤ palettes — file-palette, file-viewer, sql
 *   ⑥ diff     — worktree-changes, diff-viewer
 *   ⑦ settings — settings, wizard, toasts
 *
 * Plan-listed surfaces NOT present as standalone artboards (skipped):
 *   - sidebar            (canvas has flyout only)
 *   - quick-review       (not drawn)
 *   - pr-detail-files    (folded into pr-detail-tabs)
 *   - pr-detail-reviews  (folded into pr-detail-tabs)
 *   - whats-new          (not drawn)
 *
 * Also note: `badges` (floating badge) is a single dark-only artboard
 * in the canvas — there is no light variant.
 */
const ARTBOARDS: Artboard[] = [
  // ① system
  { id: 'flyout', selector: '[data-dc-slot="flyout"]', theme: 'light' },
  { id: 'flyout', selector: '[data-dc-slot="flyout-dark"]', theme: 'dark' },
  { id: 'palette', selector: '[data-dc-slot="palette"]', theme: 'light' },
  { id: 'palette', selector: '[data-dc-slot="palette-dark"]', theme: 'dark' },
  { id: 'badges', selector: '[data-dc-slot="badges"]', theme: 'dark' },

  // ② focus
  { id: 'focus-tab', selector: '[data-dc-slot="focus-tab"]', theme: 'light' },
  { id: 'focus-tab', selector: '[data-dc-slot="focus-tab-dark"]', theme: 'dark' },

  // ③ main
  { id: 'main-window', selector: '[data-dc-slot="main-window"]', theme: 'light' },
  { id: 'main-window', selector: '[data-dc-slot="main-window-dark"]', theme: 'dark' },
  { id: 'work-items', selector: '[data-dc-slot="work-items"]', theme: 'light' },
  { id: 'work-items', selector: '[data-dc-slot="work-items-dark"]', theme: 'dark' },

  // ④ detail
  { id: 'pr-detail-overview', selector: '[data-dc-slot="pr-detail-overview"]', theme: 'light' },
  { id: 'pr-detail-overview', selector: '[data-dc-slot="pr-detail-overview-dark"]', theme: 'dark' },
  { id: 'pr-detail-tabs', selector: '[data-dc-slot="pr-detail-tabs"]', theme: 'light' },
  { id: 'pr-detail-tabs', selector: '[data-dc-slot="pr-detail-tabs-dark"]', theme: 'dark' },

  // ⑤ palettes & code
  { id: 'file-palette', selector: '[data-dc-slot="file-palette"]', theme: 'light' },
  { id: 'file-palette', selector: '[data-dc-slot="file-palette-dark"]', theme: 'dark' },
  { id: 'file-viewer', selector: '[data-dc-slot="file-viewer"]', theme: 'light' },
  { id: 'file-viewer', selector: '[data-dc-slot="file-viewer-dark"]', theme: 'dark' },
  { id: 'sql', selector: '[data-dc-slot="sql"]', theme: 'light' },
  { id: 'sql', selector: '[data-dc-slot="sql-dark"]', theme: 'dark' },

  // ⑥ worktree changes & diff viewer
  { id: 'worktree-changes', selector: '[data-dc-slot="worktree-changes"]', theme: 'light' },
  { id: 'worktree-changes', selector: '[data-dc-slot="worktree-changes-dark"]', theme: 'dark' },
  { id: 'diff-viewer', selector: '[data-dc-slot="diff-viewer"]', theme: 'light' },
  { id: 'diff-viewer', selector: '[data-dc-slot="diff-viewer-dark"]', theme: 'dark' },

  // ⑦ settings, wizard, notifications
  { id: 'settings', selector: '[data-dc-slot="settings"]', theme: 'light' },
  { id: 'settings', selector: '[data-dc-slot="settings-dark"]', theme: 'dark' },
  { id: 'wizard', selector: '[data-dc-slot="wizard"]', theme: 'light' },
  { id: 'wizard', selector: '[data-dc-slot="wizard-dark"]', theme: 'dark' },
  { id: 'toasts', selector: '[data-dc-slot="toasts"]', theme: 'light' },
  { id: 'toasts', selector: '[data-dc-slot="toasts-dark"]', theme: 'dark' },
];

test.describe('design-baseline capture', () => {
  test.beforeAll(async ({ request }) => {
    // Fail fast with a clear error if the bundle isn't reachable via
    // the static http-server — otherwise every test below would
    // mysteriously time out waiting for #root to populate.
    const res = await request.get(DESIGN_URL);
    if (!res.ok()) {
      throw new Error(
        `Design bundle not reachable at ${DESIGN_URL} (HTTP ${res.status()}). ` +
          `Check that playwright.config.ts starts the http-server on port 1421 ` +
          `and that tests/e2e/design-bundle/borgdock/project/BorgDock - Streamlined.html exists.`,
      );
    }
  });

  for (const ab of ARTBOARDS) {
    test(`capture ${ab.id} (${ab.theme})`, async ({ page }) => {
      // Reduced motion + disabled animations: the prototype uses CSS
      // transitions on hover/drag and React state-driven transforms
      // for artboard reorder. We want a deterministic still frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.goto(DESIGN_URL);

      // Babel Standalone transpiles <script type="text/babel" src="..."> tags
      // asynchronously and serially; wait for all of them to finish before
      // checking render state.
      await page.waitForLoadState('networkidle');

      // Wait for the React canvas to mount AND fonts to be ready.
      // The bundle transpiles JSX in-browser via Babel Standalone, so
      // #root is empty on initial load; we need to wait for children.
      // System font fallbacks differ pixel-for-pixel from the bundled
      // stack, hence the extra fonts.ready gate.
      await page.waitForFunction(
        () => {
          const root = document.querySelector('#root');
          return !!root && root.children.length > 0;
        },
        undefined,
        { timeout: 15_000 },
      );
      // Fonts gate (system fallbacks differ pixel-for-pixel from the
      // bundled stack). Kept separate from the #root wait above because
      // `document.fonts.ready` resolves to the FontFaceSet, not a
      // boolean — mixing it into waitForFunction's predicate is brittle.
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });

      const locator = page.locator(ab.selector);
      await expect(locator).toBeVisible({ timeout: 10_000 });

      // Baselines live under `__screenshots__/<project>/design/` thanks
      // to the shared `snapshotPathTemplate` in `playwright.config.ts`.
      // Pass the name as a tuple (`['design', '<file>.png']`) rather than
      // a slash-joined string — Playwright sanitizes `/` → `-` in single
      // string arguments, which would flatten the directory to a prefix
      // in the filename. See `toHaveScreenshot(name: string | ReadonlyArray<string>)`
      // in `@playwright/test`. Both this capture spec and `visual.spec.ts`
      // pass the same tuple so they resolve to the same PNG on disk.
      const snapshotName: readonly [string, string] = [
        'design',
        `${ab.id}-${ab.theme}.png`,
      ];
      // First run (no baseline on disk) writes the PNG as the baseline.
      // Subsequent runs compare at maxDiffPixelRatio:0 (exact). Intended
      // workflow: run via `npm run test:e2e:capture-design` (passes
      // --update-snapshots so re-captures overwrite).
      await expect(locator).toHaveScreenshot(snapshotName, {
        // Exact capture: we're writing the reference, not comparing to it.
        maxDiffPixelRatio: 0,
        animations: 'disabled',
      });
    });
  }
});
