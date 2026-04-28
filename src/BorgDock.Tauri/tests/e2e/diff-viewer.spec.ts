import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable, seedPrDetail } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('diff viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await seedPrDetail(page, { owner: 'test-org', repo: 'test-repo', number: 714 });
    await page.goto('/pr-detail.html?number=714&tab=files');
    await waitForAppReady(page);
    // The panel defaults to the Overview tab; navigate to Files to mount
    // the diff viewer so [data-diff-file] elements become assertable.
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.waitForTimeout(200);
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
    // Two files means two "[data-action="next-hunk"]" buttons; scope to the first file.
    // scrollIntoView targets the diff pane overflow-y-auto container.
    // We capture the second hunk-header's viewport position before and after clicking
    // "Next hunk" — after the scroll it should be closer to the top of the viewport.
    const secondHunk = page.locator('[data-diff-file]').first().locator('[data-hunk-header]').nth(1);
    const topBefore = await secondHunk.evaluate((el) => el.getBoundingClientRect().top);
    await page.locator('[data-diff-file]').first().locator('[data-action="next-hunk"]').click();
    // After smooth-scrolling the second hunk into view its top should be closer to 0
    // (i.e. less than its original position, since it scrolled up).
    await expect
      .poll(
        async () => secondHunk.evaluate((el) => el.getBoundingClientRect().top),
        { timeout: 2_000 },
      )
      .toBeLessThan(topBefore);
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
