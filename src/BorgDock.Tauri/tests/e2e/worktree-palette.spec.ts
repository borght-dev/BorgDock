import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('worktree palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/palette.html?kind=worktrees');
    await waitForAppReady(page);
  });

  test('renders worktree list', async ({ page }) => {
    await expect(page.locator('[data-worktree-row]').first()).toBeVisible({ timeout: 3_000 });
  });

  test('prune action opens confirm dialog', async ({ page }) => {
    await page.locator('[data-worktree-row]').first()
      .locator('[data-action="prune"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('checkout flow can be initiated', async ({ page }) => {
    const checkoutBtn = page.locator('[data-action="checkout"]').first();
    if (await checkoutBtn.isVisible()) {
      await checkoutBtn.click();
      await expect(page.locator('[data-checkout-flow]')).toBeVisible();
    }
  });
});
