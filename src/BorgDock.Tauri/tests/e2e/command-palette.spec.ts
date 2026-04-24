import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('Cmd+K opens the palette', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('[data-command-palette]')).toBeVisible();
  });

  test('typing filters commands', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    const input = page.locator('[data-command-palette-input]');
    await input.fill('settings');
    const visible = page.locator('[data-command-item]:visible');
    const count = await visible.count();
    expect(count).toBeGreaterThan(0);
    await expect(visible.first()).toContainText(/settings/i);
  });

  test('Enter runs the first result', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    await page.locator('[data-command-palette-input]').fill('settings');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-flyout="settings"]')).toBeVisible();
  });

  test('Escape closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+K');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-command-palette]')).toBeHidden();
  });
});
