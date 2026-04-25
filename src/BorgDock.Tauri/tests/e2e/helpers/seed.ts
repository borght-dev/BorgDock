import type { Page } from '@playwright/test';
import {
  DESIGN_PRS,
  DESIGN_WORK_ITEMS,
  type DesignWorkItem,
} from '../fixtures/design-fixtures';

/**
 * Helpers that drive the dev-only `window.__borgdock_test_seed` hook
 * installed by `src/test-support/test-seed.ts` (wired from `App.tsx`).
 *
 * IMPORTANT: the hook is only installed by the MAIN window entry
 * (App.tsx). Secondary windows (`flyout-main.tsx`, `palette-main.tsx`,
 * `pr-detail-main.tsx`, `sql-main.tsx`, etc.) do NOT install the seed
 * hook today, so calling `seedDesignFixtures` on those pages throws.
 * Use `seedDesignFixturesIfAvailable` on multi-window specs that can't
 * reliably route through the main window.
 */

/**
 * Seeds the Zustand stores via `window.__borgdock_test_seed`. Call
 * AFTER `page.goto('/')` + `waitForAppReady` so the seed function is
 * actually installed.
 *
 * Throws if the hook is missing — which is the signal that either the
 * build was produced with `import.meta.env.DEV === false`, or the page
 * navigated to a secondary window entry that doesn't install the hook.
 */
export async function seedDesignFixtures(
  page: Page,
  overrides: { prs?: unknown; workItems?: DesignWorkItem[] } = {},
) {
  await page.evaluate(
    ({ prs, workItems }) => {
      const seed = (window as unknown as {
        __borgdock_test_seed?: (p: { prs?: unknown; workItems?: unknown }) => void;
      }).__borgdock_test_seed;
      if (typeof seed !== 'function') {
        throw new Error(
          '__borgdock_test_seed is not installed. The hook is only registered by App.tsx ' +
            '(main window) in DEV mode. If this spec navigates to a secondary window ' +
            '(flyout/palette/pr-detail/sql/file-viewer/etc.), use seedDesignFixturesIfAvailable ' +
            'or seed through the main window before navigating.',
        );
      }
      seed({ prs, workItems });
    },
    {
      prs: overrides.prs ?? DESIGN_PRS,
      workItems: overrides.workItems ?? DESIGN_WORK_ITEMS,
    },
  );
  // Give React a tick to render the seeded state.
  await page.waitForTimeout(50);
}

/**
 * Best-effort variant: no-op if the seed hook isn't present (e.g.
 * secondary-window entries that don't install test-seed). Useful for
 * specs that want to seed when possible without hard-failing on
 * windows that don't support it yet.
 *
 * On the flyout window the main `__borgdock_test_seed` hook is absent
 * (the flyout reads from a Tauri event, not pr-store), so we instead
 * detect `__borgdock_test_flyout_seed` (installed by FlyoutApp in DEV)
 * and project DESIGN_PRS into the FlyoutData shape it expects.
 */
export async function seedDesignFixturesIfAvailable(
  page: Page,
  overrides: { prs?: unknown; workItems?: DesignWorkItem[] } = {},
) {
  const hooks = await page.evaluate(() => {
    return {
      hasMain: typeof (window as unknown as { __borgdock_test_seed?: unknown })
        .__borgdock_test_seed === 'function',
      hasFlyout: typeof (window as unknown as { __borgdock_test_flyout_seed?: unknown })
        .__borgdock_test_flyout_seed === 'function',
    };
  });
  if (hooks.hasMain) {
    await seedDesignFixtures(page, overrides);
    return;
  }
  if (hooks.hasFlyout) {
    const prs = (overrides.prs as typeof DESIGN_PRS | undefined) ?? DESIGN_PRS;
    await page.evaluate(
      ({ prs }) => {
        // Project the canonical DESIGN_PRS rows into the FlyoutPr shape the
        // flyout window consumes. Mirrors the mapping the Rust
        // `flyout-update` event emits in production.
        const flyoutPrs = (prs as Array<{
          pullRequest: {
            number: number;
            title: string;
            repoOwner: string;
            repoName: string;
            authorLogin: string;
            authorAvatarUrl: string;
            reviewStatus: string;
            commentCount?: number;
          };
          overallStatus: string;
          failedCheckNames: string[];
          pendingCheckNames: string[];
          passedCount: number;
        }>).map((pr) => ({
          number: pr.pullRequest.number,
          title: pr.pullRequest.title,
          repoOwner: pr.pullRequest.repoOwner,
          repoName: pr.pullRequest.repoName,
          authorLogin: pr.pullRequest.authorLogin,
          authorAvatarUrl: pr.pullRequest.authorAvatarUrl,
          overallStatus: pr.overallStatus,
          reviewStatus: pr.pullRequest.reviewStatus,
          failedCount: pr.failedCheckNames.length,
          failedCheckNames: pr.failedCheckNames,
          pendingCount: pr.pendingCheckNames.length,
          passedCount: pr.passedCount,
          totalChecks:
            pr.passedCount + pr.failedCheckNames.length + pr.pendingCheckNames.length,
          commentCount: pr.pullRequest.commentCount ?? 0,
          isMine: false,
        }));
        const failingCount = flyoutPrs.filter((p) => p.overallStatus === 'red').length;
        const pendingCount = flyoutPrs.filter((p) => p.overallStatus === 'yellow').length;
        const passingCount = flyoutPrs.filter((p) => p.overallStatus === 'green').length;
        const seed = (window as unknown as {
          __borgdock_test_flyout_seed?: (p: {
            data?: Record<string, unknown>;
            mode?: 'glance' | 'idle' | 'initializing';
          }) => void;
        }).__borgdock_test_flyout_seed!;
        seed({
          data: {
            pullRequests: flyoutPrs,
            failingCount,
            pendingCount,
            passingCount,
            totalCount: flyoutPrs.length,
            username: 'testuser',
            theme: 'dark',
            lastSyncAgo: 'just now',
            hotkey: 'Ctrl+Win+Shift+G',
          },
          mode: 'glance',
        });
      },
      { prs },
    );
    // React tick.
    await page.waitForTimeout(50);
  }
}

/**
 * Toggles the root `.dark` class to force a specific theme, regardless
 * of the user's system preference or settings. Matches the design
 * bundle's theming mechanism (the streamlined canvas also uses a
 * `.dark` class scope per artboard pair).
 */
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

/**
 * Sets body-level density class. The current app may not yet honor
 * these classes — that's fine; the visual spec forces a known density
 * so later PRs (#1-#7) can wire the CSS without changing test code.
 */
export async function setDensity(page: Page, density: 'compact' | 'comfortable') {
  await page.evaluate((d) => {
    document.body.classList.remove('density-compact', 'density-comfortable');
    document.body.classList.add(`density-${d}`);
  }, density);
}
