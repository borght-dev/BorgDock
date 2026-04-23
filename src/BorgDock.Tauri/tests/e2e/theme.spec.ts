import { test, expect } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady, TAURI_MOCK_SCRIPT } from './helpers/test-utils';
import { completedSettings } from './helpers/test-utils';

test.describe('Theme Switching', () => {
  test('dark theme applies dark class to document root', async ({ page }) => {
    // Inject settings with dark theme
    const settings = completedSettings();
    settings.ui.theme = 'dark';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    await page.goto('/');
    await waitForAppReady(page);

    // The <html> element should have the 'dark' class
    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(true);
  });

  test('light theme removes dark class from document root', async ({ page }) => {
    const settings = completedSettings();
    settings.ui.theme = 'light';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    await page.goto('/');
    await waitForAppReady(page);

    // The <html> element should NOT have the 'dark' class
    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(false);
  });

  test('switching theme via settings updates document root class', async ({ page }) => {
    // Start with dark theme
    const settings = completedSettings();
    settings.ui.theme = 'dark';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    await page.goto('/');
    await waitForAppReady(page);

    // Verify dark class is present
    let hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(true);

    // Open settings and switch to light theme
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForTimeout(200);

    // Click the "Light" theme button in the Appearance section
    const lightBtn = page.getByRole('button', { name: 'Light', exact: true }).first();
    await lightBtn.scrollIntoViewIfNeeded();
    await lightBtn.click();
    await page.waitForTimeout(200);

    // Save settings
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(300);

    // The dark class should now be removed
    hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(false);
  });

  test('system theme respects OS preference', async ({ page }) => {
    const settings = completedSettings();
    settings.ui.theme = 'system';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await waitForAppReady(page);

    let hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(true);
  });

  test('system theme with light OS preference does not add dark class', async ({ page }) => {
    const settings = completedSettings();
    settings.ui.theme = 'system';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    // Emulate light color scheme
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await waitForAppReady(page);

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    );
    expect(hasDarkClass).toBe(false);
  });

  test('theme changes propagate to CSS variables', async ({ page }) => {
    const settings = completedSettings();
    settings.ui.theme = 'dark';

    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}
      window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
    `);

    await page.goto('/');
    await waitForAppReady(page);

    // Check that the background of the main container uses CSS variables
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector('.bg-\\[var\\(--color-background\\)\\]');
      if (!el) return null;
      return getComputedStyle(el).backgroundColor;
    });

    // The background color should be a valid CSS color value (not empty)
    expect(bgColor).toBeTruthy();
  });
});
