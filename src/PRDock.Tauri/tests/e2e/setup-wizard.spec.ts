import { test, expect } from '@playwright/test';
import { injectTauriMocks, waitForAppReady } from './helpers/test-utils';

test.describe('Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mocks with setupComplete=false (the default)
    await injectTauriMocks(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('wizard shows when setupComplete is false', async ({ page }) => {
    // The wizard should be visible as a full-screen overlay
    const wizardOverlay = page.locator('[class*="fixed inset-0"]').first();
    await expect(wizardOverlay).toBeVisible();

    // Should show the "Connect to GitHub" heading (Auth step)
    await expect(page.getByText('Connect to GitHub')).toBeVisible();
  });

  test('auth step shows GitHub CLI and PAT options', async ({ page }) => {
    await expect(page.getByText('GitHub CLI')).toBeVisible();
    await expect(page.getByText('Access Token')).toBeVisible();
    await expect(
      page.getByText('Choose how PRDock authenticates with GitHub')
    ).toBeVisible();
  });

  test('selecting PAT shows token input', async ({ page }) => {
    // Click the "Access Token" button
    await page.getByText('Access Token').click();

    // The PAT input field should now be visible
    await expect(page.getByPlaceholder('ghp_...')).toBeVisible();
    await expect(page.getByText('Personal Access Token')).toBeVisible();
  });

  test('verify connection button is present', async ({ page }) => {
    const verifyBtn = page.getByRole('button', { name: 'Verify Connection' });
    await expect(verifyBtn).toBeVisible();
  });

  test('clicking Next advances to repos step', async ({ page }) => {
    // Select PAT and enter a token so Next is enabled
    await page.getByText('Access Token').click();
    await page.getByPlaceholder('ghp_...').fill('ghp_testtoken123');

    // Click Next
    await page.getByRole('button', { name: 'Next' }).click();

    // Wait for repo step to appear (it shows a scanning state or repos)
    // The repo step may show scanning or discovered repos
    await page.waitForTimeout(500);

    // The Back button should now be visible (we're past step 0)
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  });

  test('clicking Next from repos advances to position step', async ({ page }) => {
    // Go through auth step
    await page.getByText('Access Token').click();
    await page.getByPlaceholder('ghp_...').fill('ghp_testtoken123');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(500);

    // On repo step, select a repo and click Next
    // The mock returns discovered repos that are pre-selected
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(300);

    // Position step should show "Customize Appearance"
    await expect(page.getByText('Customize Appearance')).toBeVisible();
    await expect(page.getByText('Sidebar Position')).toBeVisible();
  });

  test('position step shows left/right and theme options', async ({ page }) => {
    // Navigate to position step
    await page.getByText('Access Token').click();
    await page.getByPlaceholder('ghp_...').fill('ghp_testtoken123');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(300);

    // Verify left/right options
    const leftBtn = page.getByRole('button', { name: 'left' });
    const rightBtn = page.getByRole('button', { name: 'right' });
    await expect(leftBtn).toBeVisible();
    await expect(rightBtn).toBeVisible();

    // Verify theme options
    await expect(page.getByText('Theme')).toBeVisible();
    await expect(page.getByRole('button', { name: 'System' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible();
  });

  test('clicking Finish saves settings', async ({ page }) => {
    // Navigate through all steps
    await page.getByText('Access Token').click();
    await page.getByPlaceholder('ghp_...').fill('ghp_testtoken123');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(300);

    // On position step, the button should say "Finish"
    const finishBtn = page.getByRole('button', { name: 'Finish' });
    await expect(finishBtn).toBeVisible();

    // Click Finish
    await finishBtn.click();
    await page.waitForTimeout(500);

    // After finishing, the wizard overlay should be gone and the sidebar visible
    // The "Connect to GitHub" heading should no longer be visible
    await expect(page.getByText('Connect to GitHub')).not.toBeVisible();
  });
});
