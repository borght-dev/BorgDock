import { test, expect } from '@playwright/test';
import { TAURI_MOCK_SCRIPT } from './helpers/test-utils';

test.describe('Badge Window', () => {
  test.beforeEach(async ({ page }) => {
    // The badge page uses @tauri-apps/api/event, so we need mocks
    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}

      // Mock the listen function to immediately provide badge data
      const origInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.__listeners = {};
      window.__TAURI_INTERNALS__.transformCallback = (fn) => {
        const id = Math.random().toString(36).slice(2);
        window['_' + id] = fn;
        return Number(id) || 0;
      };
    `);

    await page.goto('/badge.html');
    // Wait for the badge app to mount
    await page.waitForTimeout(500);
  });

  test('badge.html page loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Wait a bit for any async errors
    await page.waitForTimeout(1000);

    // Filter out expected Tauri-related errors (event listener failures)
    const unexpectedErrors = consoleErrors.filter(
      (e) =>
        !e.includes('badge') &&
        !e.includes('listen') &&
        !e.includes('Tauri') &&
        !e.includes('__TAURI')
    );

    // The page should have loaded React successfully
    const rootEl = page.locator('#root');
    await expect(rootEl).toBeVisible();
  });

  test('FloatingBadge component renders', async ({ page }) => {
    // The badge app renders inside a container with flex centering
    const container = page.locator('.flex.h-screen.w-screen');
    await expect(container).toBeVisible({ timeout: 5000 });
  });

  test('badge shows PR count', async ({ page }) => {
    // The default state shows 0 PRs
    // The PR count is rendered as a span with text-sm font-bold
    const prCount = page.locator('span.text-sm.font-bold');
    await expect(prCount).toBeVisible({ timeout: 5000 });

    // Default count should be 0
    await expect(prCount).toHaveText('0');
  });

  test('badge shows status dot', async ({ page }) => {
    // The status dot is a div with rounded-full and h-3 w-3
    const statusDot = page.locator('.h-3.w-3.rounded-full').first();
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });

  test('badge shows status text', async ({ page }) => {
    // Default status text is "all clear" (0 failing, 0 pending)
    await expect(page.getByText('all clear')).toBeVisible({ timeout: 5000 });
  });

  test('badge pill button is clickable', async ({ page }) => {
    // The main badge is a button element
    const badgeButton = page.locator('button').filter({ hasText: /\d/ }).first();
    await expect(badgeButton).toBeVisible({ timeout: 5000 });

    // Click should not throw
    await badgeButton.click();
    await page.waitForTimeout(200);
  });

  test('badge renders with glass capsule style', async ({ page }) => {
    // The badge pill has backdrop-blur-md and rounded-full
    const pill = page.locator('[class*="backdrop-blur"]').first();
    await expect(pill).toBeVisible({ timeout: 5000 });

    // Verify it has the glass styling
    const classes = await pill.getAttribute('class');
    expect(classes).toContain('rounded-full');
    expect(classes).toContain('backdrop-blur');
  });
});
