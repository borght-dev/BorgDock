import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('diff viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/pr-detail.html?number=714&tab=files');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);
  });

  test('renders file list with additions/deletions counts', async ({ page }) => {
    const files = page.locator('[data-diff-file]');
    await expect(files.first()).toBeVisible();
    await expect(files.first().locator('[data-diff-stat="added"]')).toContainText(/\d+/);
    await expect(files.first().locator('[data-diff-stat="deleted"]')).toContainText(/\d+/);
  });

  test('hunk header renders with @@ markers', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    await expect(page.locator('[data-hunk-header]').first()).toContainText('@@');
  });

  test('added / deleted lines use status colors', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    const addedBg = await page.locator('[data-line-kind="add"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const deletedBg = await page.locator('[data-line-kind="del"]').first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    // The tokens differ in hue — we assert they aren't the same
    expect(addedBg).not.toBe(deletedBg);
  });

  test('hunk nav (next/prev) scrolls', async ({ page }) => {
    await page.locator('[data-diff-file]').first().click();
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.locator('[data-action="next-hunk"]').click();
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 2_000 })
      .not.toBe(scrollYBefore);
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
