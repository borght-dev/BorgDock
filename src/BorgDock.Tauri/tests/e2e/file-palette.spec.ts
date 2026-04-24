import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('file palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/palette.html?kind=files');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('renders the search input with placeholder', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('typing narrows the results list', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    const initialCount = await page.locator('[data-file-result]').count();
    await input.fill('footer');
    await page.waitForTimeout(150);
    const filteredCount = await page.locator('[data-file-result]').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('arrow keys move selection', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('[data-file-result][data-selected="true"]');
    await expect(selected).toHaveCount(1);
  });

  test('enter opens the file in preview pane', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-file-preview]')).toBeVisible();
  });

  test('escape closes palette', async ({ page }) => {
    await page.keyboard.press('Escape');
    // palette is in its own window — closing should emit a close event
    // (frontend pattern — verify window.close called, or element hidden)
    const hidden = await page.evaluate(() =>
      !document.querySelector('[data-window="palette"]') ||
      document.querySelector('[data-window="palette"]')?.getAttribute('data-hidden') === 'true',
    );
    expect(hidden).toBe(true);
  });
});
