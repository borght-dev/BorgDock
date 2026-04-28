import { test, expect } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady, openSettings } from './helpers/test-utils';

test.describe('Settings Flyout', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('clicking settings icon opens the flyout', async ({ page }) => {
    await openSettings(page);

    // Assert the flyout panel itself is visible — same contract as the
    // `?settings=open` URL-routed visual surface in visual.spec.ts (PR #9).
    // Both paths converge on `useUiStore.setSettingsOpen(true)` → render
    // the panel marked with `data-flyout="settings"`.
    await expect(page.locator('[data-flyout="settings"]')).toBeVisible();

    // The flyout header should show "Settings"
    await expect(
      page.locator('span').filter({ hasText: /^Settings$/ }).first()
    ).toBeVisible();

    // The flyout's close affordance ("Close settings" IconButton) should
    // be present. The settings flyout intentionally has NO Save/Cancel
    // buttons — see commit 423cfc7e: settings auto-save via debounced
    // timer, and the close button flushes any pending save. The earlier
    // Save/Cancel assertions in this test were aspirational against an
    // older design and never matched the shipped UI.
    await expect(
      page.getByRole('button', { name: 'Close settings' })
    ).toBeVisible();
  });

  test('flyout shows all sections', async ({ page }) => {
    await openSettings(page);

    const sectionTitles = [
      'GitHub',
      'Repositories',
      'Appearance',
      'Notifications',
      'Claude Code',
      'Azure DevOps',
      'Updates',
      'Maintenance',
    ];

    for (const title of sectionTitles) {
      await expect(
        page.locator('h3').filter({ hasText: title }).first()
      ).toBeVisible();
    }
  });

  // Two e2e tests previously stood here — `'Cancel button closes without saving'`
  // and `'Save button closes the flyout'` — both asserting against buttons that
  // commit 423cfc7e removed when the flyout switched to debounced auto-save +
  // single close affordance. They were dropped (rather than rewritten against
  // the IconButton close path) because:
  //   1. The open-and-close round-trip is already covered by the
  //      `'clicking settings icon opens the flyout'` test above (it asserts
  //      `[data-flyout="settings"]` visibility AND the `Close settings`
  //      IconButton presence).
  //   2. The save-on-close behavior (debounced timer + close-flush effect at
  //      `SettingsFlyout.tsx:39-56`) is straightforward to assert with vitest
  //      fake timers and belongs at the unit-test layer, not in a Playwright
  //      surface spec.
  // git blame preserves the original assertions if a future contributor wants
  // to resurrect the close-flush flow as an e2e exercise rather than a unit one.

  test('theme toggle shows System, Light, Dark buttons', async ({ page }) => {
    await openSettings(page);

    // Scroll to find the Appearance section
    const appearanceSection = page.locator('h3').filter({ hasText: 'Appearance' });
    await appearanceSection.scrollIntoViewIfNeeded();

    // Theme buttons within the Appearance section
    const themeButtons = ['System', 'Light', 'Dark'];
    for (const theme of themeButtons) {
      await expect(
        page.getByRole('button', { name: theme, exact: true }).first()
      ).toBeVisible();
    }
  });

  test('sidebar edge toggle shows Left and Right buttons', async ({ page }) => {
    await openSettings(page);

    const appearanceSection = page.locator('h3').filter({ hasText: 'Appearance' });
    await appearanceSection.scrollIntoViewIfNeeded();

    await expect(
      page.getByRole('button', { name: 'Left', exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Right', exact: true }).first()
    ).toBeVisible();
  });

  test('hotkey recorder enters recording mode on click', async ({ page }) => {
    await openSettings(page);

    // Scroll to find the hotkey recorder
    const hotkeyLabel = page.getByText('Global Hotkey');
    await hotkeyLabel.scrollIntoViewIfNeeded();

    // Find the hotkey recorder button (shows current shortcut or "Not set")
    const hotkeyBtn = page.locator('button').filter({ hasText: /Ctrl\+Shift\+P|Not set/ }).first();
    await expect(hotkeyBtn).toBeVisible();

    // Click to start recording
    await hotkeyBtn.click();
    await page.waitForTimeout(200);

    // Should now show recording state text
    await expect(
      page.getByText('Press a key combo...')
    ).toBeVisible();
  });

  test('run at startup toggle is present', async ({ page }) => {
    await openSettings(page);

    const startupLabel = page.getByText('Run at startup');
    await startupLabel.scrollIntoViewIfNeeded();
    await expect(startupLabel).toBeVisible();

    // The toggle button should be near the label
    // It's a button with rounded-full class acting as a toggle switch
    const toggleArea = startupLabel.locator('..').locator('button');
    await expect(toggleArea).toBeVisible();
  });
});
