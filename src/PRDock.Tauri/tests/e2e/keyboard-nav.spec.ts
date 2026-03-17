import { test, expect } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('ArrowDown does not throw errors on empty PR list', async ({ page }) => {
    // With no PRs loaded, pressing ArrowDown should not cause errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    // No JS errors should have been thrown
    const hasRelevantError = consoleErrors.some(
      (e) => e.includes('Cannot read') || e.includes('undefined')
    );
    expect(hasRelevantError).toBe(false);
  });

  test('ArrowUp does not throw errors on empty PR list', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    const hasRelevantError = consoleErrors.some(
      (e) => e.includes('Cannot read') || e.includes('undefined')
    );
    expect(hasRelevantError).toBe(false);
  });

  test('j key behaves like ArrowDown', async ({ page }) => {
    // Ensure focus is on the body (not an input)
    await page.locator('body').click();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    const hasRelevantError = consoleErrors.some(
      (e) => e.includes('Cannot read') || e.includes('undefined')
    );
    expect(hasRelevantError).toBe(false);
  });

  test('k key behaves like ArrowUp', async ({ page }) => {
    await page.locator('body').click();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.keyboard.press('k');
    await page.waitForTimeout(200);

    const hasRelevantError = consoleErrors.some(
      (e) => e.includes('Cannot read') || e.includes('undefined')
    );
    expect(hasRelevantError).toBe(false);
  });

  test('Escape deselects current PR / has no side effects when nothing selected', async ({
    page,
  }) => {
    await page.locator('body').click();

    // Press Escape when nothing is selected should be a no-op
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // The sidebar should still be visible with the header
    await expect(page.locator('header')).toBeVisible();

    // Filter bar and search should still be visible
    await expect(page.getByPlaceholder('Search PRs...')).toBeVisible();
  });

  test('keyboard nav does not interfere with input fields', async ({ page }) => {
    // Focus the search input
    const searchInput = page.getByPlaceholder('Search PRs...');
    await searchInput.click();
    await searchInput.fill('');

    // Type 'j' and 'k' into the search input
    await page.keyboard.type('jk');
    await page.waitForTimeout(200);

    // The input should contain 'jk' (not intercepted by keyboard nav)
    await expect(searchInput).toHaveValue('jk');
  });

  test('Enter key does not cause errors when no PR is focused', async ({ page }) => {
    await page.locator('body').click();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    const hasRelevantError = consoleErrors.some(
      (e) => e.includes('Cannot read') || e.includes('undefined')
    );
    expect(hasRelevantError).toBe(false);
  });

  test('Ctrl+R dispatches refresh event', async ({ page }) => {
    await page.locator('body').click();

    // Listen for the custom refresh event
    const refreshFired = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        document.addEventListener(
          'prdock-refresh',
          () => resolve(true),
          { once: true }
        );
        // Timeout fallback
        setTimeout(() => resolve(false), 2000);
      });
    });

    // Note: the evaluate above already resolved, so we fire the key separately
    // We need to set up the listener first, then press the key.
    // Let's restructure:
    const result = await page.evaluate(async () => {
      let fired = false;
      document.addEventListener('prdock-refresh', () => {
        fired = true;
      });

      // Simulate Ctrl+R via dispatching a KeyboardEvent
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'r',
          ctrlKey: true,
          bubbles: true,
        })
      );

      // Wait a tick
      await new Promise((r) => setTimeout(r, 100));
      return fired;
    });

    expect(result).toBe(true);
  });
});
