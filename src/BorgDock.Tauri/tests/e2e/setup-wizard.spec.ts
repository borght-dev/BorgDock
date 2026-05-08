import { expect, test } from '@playwright/test';
import { bootApp } from './helpers/test-utils';

/**
 * Setup wizard: visible iff `settings.setupComplete === false` (App.tsx
 * gates `!settings.setupComplete || ...` and renders <SetupWizard /> on
 * the splash branch).
 *
 * The first step heading is "Connect to GitHub" (AuthStep.tsx) and the
 * outer overlay carries `data-wizard-overlay`.
 */

test('first-run lands on the wizard', async ({ page }) => {
  await bootApp(page, '', 'first-run');
  await expect(page.locator('[data-wizard-overlay]')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Connect to GitHub/i }),
  ).toBeVisible();
});

test('happy-path scenario does not show the wizard', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  // Wizard overlay should never mount when setupComplete is true.
  await expect(page.locator('[data-wizard-overlay]')).toHaveCount(0);
});
