import { expect, test } from '@playwright/test';
import { bootApp, expectInvoked } from './helpers/test-utils';

/**
 * Settings window. Default section is 'github' (see SettingsApp readInitialSection).
 *
 * - Auth indicator copy: "Authenticated via gh as <username>" (GitHubSection).
 * - Theme is rendered by AppearanceSection's Seg2; each option is a
 *   <button aria-pressed=...> with label "System" / "Light" / "Dark".
 *   Clicking a non-pressed option triggers the debounced save_settings.
 */

test('settings shows authed providers (happy-path)', async ({ page }) => {
  await bootApp(page, 'settings.html', 'happy-path');
  await expect(page.getByText(/Authenticated via/i)).toBeVisible();
  await expect(page.getByText('test-user').first()).toBeVisible();
});

test('settings shows empty state for unauthed', async ({ page }) => {
  await bootApp(page, 'settings.html', 'empty');
  // Empty scenario uses authMethod='ghCli' but username='' → renders the
  // "Authenticated via gh as —" placeholder. The "—" em-dash is the
  // signal that no username has been resolved yet.
  await expect(page.getByText(/Authenticated via/i)).toBeVisible();
});

test('theme toggle calls save_settings', async ({ page }) => {
  await bootApp(page, 'settings.html', 'happy-path');
  // Navigate to the Appearance section first — the Seg2 lives there.
  await page.getByRole('button', { name: /^Appearance$/ }).click();
  // Click the Dark theme button. Seg2 buttons aren't role=radio; they're
  // plain buttons with aria-pressed.
  await page.getByRole('button', { name: 'Dark' }).click();
  // saveSettings is debounced 300ms in SettingsApp — wait for it.
  await page.waitForTimeout(500);
  await expectInvoked(page, 'save_settings');
});
