import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
 * Targeting strategy: the vendored `design-canvas.jsx` already stamps
 * each artboard root with `data-dc-slot="<id>"` (see
 * DCArtboardFrame). `LightDarkPair id="X"` expands to two artboards,
 * one with slot `X` (light) and one with slot `X-dark` wrapped in a
 * `.dark` class scope (see BorgDock - Streamlined.html). No HTML edit
 * is needed — we use the existing attribute directly.
 */

// ESM equivalent of CommonJS __dirname — the package is `"type": "module"`.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESIGN_HTML = path.resolve(
  __dirname,
  '../design-bundle/borgdock/project/BorgDock - Streamlined.html',
);

type Artboard = {
  /** Stable surface id — used in the snapshot filename. */
  id: string;
  /** CSS selector for the artboard root, must resolve to exactly one element. */
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
  test.beforeAll(async () => {
    // Fail fast with a clear error if the vendored bundle is missing —
    // otherwise every test below would mysteriously time out on file://.
    const fs = await import('node:fs/promises');
    try {
      await fs.access(DESIGN_HTML);
    } catch (err) {
      throw new Error(
        `Design bundle HTML not found at ${DESIGN_HTML}. ` +
          `The vendored design-bundle/ subtree may be missing — see ` +
          `tests/e2e/design-bundle/README.md. Original error: ${(err as Error).message}`,
      );
    }
  });

  for (const ab of ARTBOARDS) {
    test(`capture ${ab.id} (${ab.theme})`, async ({ page }) => {
      // Reduced motion + disabled animations: the prototype uses CSS
      // transitions on hover/drag and React state-driven transforms
      // for artboard reorder. We want a deterministic still frame.
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.goto(pathToFileURL(DESIGN_HTML).toString());

      // Fonts must be fully loaded — system font fallbacks differ
      // pixel-for-pixel from the bundled stack.
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (document as any).fonts?.ready;
      });

      const locator = page.locator(ab.selector);
      await expect(locator).toBeVisible({ timeout: 10_000 });

      const snapshotName = `design/${ab.id}-${ab.theme}.png`;
      await expect(locator).toHaveScreenshot(snapshotName, {
        // Exact capture: we're writing the reference, not comparing to it.
        maxDiffPixelRatio: 0,
        animations: 'disabled',
      });
    });
  }
});
