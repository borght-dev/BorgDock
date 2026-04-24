import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable } from './helpers/seed';
import { DESIGN_PRS } from './fixtures/design-fixtures';

test.describe('flyout', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/flyout.html');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);
  });

  test('renders one row per seeded PR', async ({ page }) => {
    const rows = page.locator('[data-pr-row]');
    await expect(rows).toHaveCount(DESIGN_PRS.length);
  });

  test('row shows repo · #number · status', async ({ page }) => {
    const first = page.locator('[data-pr-row]').first();
    await expect(first).toContainText('FSP');
    await expect(first).toContainText('#715');
  });

  test('review state pill renders when set', async ({ page }) => {
    // PR #714 has reviewStatus = 'approved' in fixtures
    const approvedRow = page.locator('[data-pr-row][data-pr-number="714"]');
    await expect(approvedRow.locator('[data-pill-tone]')).toContainText(/approved/i);
  });

  test('click row opens PR detail', async ({ page }) => {
    const first = page.locator('[data-pr-row]').first();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      first.click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('pr-detail.html');
  });

  test('j / k keyboard navigates between rows', async ({ page }) => {
    await page.keyboard.press('j');
    const activeIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pr-row]'))
        .findIndex((el) => el.matches('[data-active="true"]')),
    );
    expect(activeIndex).toBe(1);
    await page.keyboard.press('k');
    const back = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pr-row]'))
        .findIndex((el) => el.matches('[data-active="true"]')),
    );
    expect(back).toBe(0);
  });
});
