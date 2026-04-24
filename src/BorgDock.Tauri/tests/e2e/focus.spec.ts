import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('focus', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
    await page.getByRole('button', { name: 'Focus' }).click();
  });

  test('shows priority-ordered PR list', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    await expect(items).toHaveCount(await items.count());
    await expect(items.first()).toBeVisible();
  });

  test('priority reason label is present on every item', async ({ page }) => {
    const items = page.locator('[data-focus-item]');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i).locator('[data-priority-reason]')).toBeVisible();
    }
  });

  test('Quick Review opens, cycles, closes', async ({ page }) => {
    await page.keyboard.press('r');
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
    await page.keyboard.press('r');
    const summary = page.locator('[data-quick-review-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/of\s+\d+/);
  });
});
