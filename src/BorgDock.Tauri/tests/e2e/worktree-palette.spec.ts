import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { expectNoA11yViolations } from './helpers/a11y';

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

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
