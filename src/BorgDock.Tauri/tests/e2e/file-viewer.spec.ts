import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('file viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/file-viewer.html?file=src/quote/footer.tsx');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);
  });

  test('renders the file path in the titlebar', async ({ page }) => {
    await expect(page.locator('[data-titlebar-path]')).toContainText('footer.tsx');
  });

  test('renders line numbers', async ({ page }) => {
    const gutter = page.locator('[data-line-gutter] [data-line-number]');
    await expect(gutter.first()).toBeVisible();
    const count = await gutter.count();
    expect(count).toBeGreaterThan(0);
  });

  test('syntax tokens get a class', async ({ page }) => {
    // Tree-sitter applies class names like 'hl-keyword' to highlighted tokens
    const tokens = page.locator('[class*="hl-"]');
    await expect(tokens.first()).toBeVisible({ timeout: 3_000 });
  });

  test('copy button copies to clipboard', async ({ page, context }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('webview-'),
      'navigator.clipboard requires Chromium-like with permission grants.',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-action="copy-contents"]').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.length).toBeGreaterThan(0);
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
