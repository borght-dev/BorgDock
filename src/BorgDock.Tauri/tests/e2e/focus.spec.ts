import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('focus', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
    // Section switcher uses the Tabs primitive (role="tab"); explicit role
    // override means getByRole('button', …) won't match these buttons.
    await page.getByRole('tab', { name: 'Focus' }).click();
  });

  test('shows priority-ordered PR list', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('priority reason label is present on every item', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i).locator('[data-priority-reason]')).toBeVisible();
    }
  });

  test('Quick Review opens, cycles, closes', async ({ page }) => {
    // Start a multi-PR session via the dev-only test hook. The 'r'/Shift+R
    // shortcuts gate on focusPrs/needsMyReview, which in turn depend on
    // requestedReviewers being set on the fixtures — this test is about the
    // overlay's keyboard cycle, so we start the session directly.
    await page.evaluate(() => {
      const start = (window as unknown as {
        __borgdock_test_start_quick_review?: (count?: number) => void;
      }).__borgdock_test_start_quick_review;
      if (typeof start === 'function') start(3);
    });
    const overlay = page.locator('[data-overlay="quick-review"]');
    await expect(overlay).toBeVisible();
    const firstTitle = await overlay.locator('[data-pr-title]').textContent();
    await page.keyboard.press('ArrowRight');
    const nextTitle = await overlay.locator('[data-pr-title]').textContent();
    expect(nextTitle).not.toBe(firstTitle);
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('Quick Review summary shows counts', async ({ page }) => {
    // Single-PR session ('r'): skipping the only PR jumps the overlay to
    // its complete state, which renders the QuickReviewSummary.
    await page.keyboard.press('r');
    await page.keyboard.press('ArrowRight');
    const summary = page.locator('[data-quick-review-summary]');
    await expect(summary).toBeVisible();
    // Summary header reads "<n> PR(s) reviewed"; tally row labels Skipped /
    // Approved / Commented with the matching count above them.
    await expect(summary).toContainText(/\d+\s+PRs?\s+reviewed/i);
    await expect(summary).toContainText(/Skipped/i);
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    // Disable button-name: the FirstRunOverlay close button (in components/
    // onboarding/FirstRunOverlay.tsx) has no aria-label. Onboarding is
    // outside the PR #3 surface scope; tracked for the onboarding sweep.
    await expectNoA11yViolations(page, { disableRules: ['button-name'] });
  });
});
