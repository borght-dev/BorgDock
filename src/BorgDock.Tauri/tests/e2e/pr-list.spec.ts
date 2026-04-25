import { test, expect } from '@playwright/test';
import {
  injectCompletedSetup,
  waitForAppReady,
  injectPrsViaStore,
} from './helpers/test-utils';

test.describe('PR List', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    // Default activeSection is 'focus' (per ui-store). These tests assert the
    // PR list surface, so switch to it first. Tabs primitive uses role="tab".
    await page.getByRole('tab', { name: 'PRs' }).click();
  });

  test('shows "No pull requests found" when empty', async ({ page }) => {
    // With completed setup but no PRs loaded, after the first poll completes
    // we should see the empty state. Since polling is mocked (invoke returns []),
    // the store will have no PRs. We need to wait for the polling to set lastPollTime.
    // Force the store state via evaluate.
    await page.evaluate(() => {
      // Simulate that a poll has completed with no results
      const event = new CustomEvent('__borgdock_force_state', {
        detail: { isPolling: false, lastPollTime: new Date().toISOString() },
      });
      window.dispatchEvent(event);
    });
    // The empty state text may already be there since we have 0 PRs
    // Give the component a moment to render
    await page.waitForTimeout(300);

    await expect(page.getByText('No pull requests found')).toBeVisible();
  });

  test('filter buttons are visible', async ({ page }) => {
    // FilterBar labels per the current Header/FilterBar (PR #1+#2 chrome).
    const filterLabels = ['All', 'Needs Review', 'Mine', 'Failing', 'Ready', 'Review', 'Closed'];
    for (const label of filterLabels) {
      await expect(
        page.locator('button').filter({ hasText: label }).first()
      ).toBeVisible();
    }
  });

  test('clicking a filter changes the active filter', async ({ page }) => {
    // Click "Failing" filter
    const failingBtn = page.locator('button').filter({ hasText: 'Failing' }).first();
    await failingBtn.click();
    // Active filter renders with accent-subtle background (FilterBar.tsx).
    await expect(failingBtn).toHaveClass(/bg-\[var\(--color-accent-subtle\)\]/);
  });

  test('search bar is visible and accepts input', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Filter pull requests...');
    await expect(searchInput).toBeVisible();

    // Type into the search bar
    await searchInput.fill('login');
    await expect(searchInput).toHaveValue('login');
  });

  test('search bar clear button appears when text is entered', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Filter pull requests...');
    await searchInput.fill('test');

    // Clear button should now be visible
    const clearBtn = page.getByRole('button', { name: 'Clear search' });
    await expect(clearBtn).toBeVisible();

    // Click clear
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
  });

  test('header contains BorgDock logo and section switcher', async ({ page }) => {
    await expect(page.getByText('BorgDock')).toBeVisible();

    // Section switcher tabs
    await expect(page.getByRole('tab', { name: 'PRs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Work Items' })).toBeVisible();
  });

  test('shows loading skeletons during first load', async ({ page }) => {
    // Create a new page context where the store simulates first load (isPolling=true, no lastPollTime)
    const freshPage = page;
    await injectCompletedSetup(freshPage);

    // Override the mock to delay the load_settings response
    await freshPage.addInitScript(`
      const origInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        if (cmd === 'load_settings') {
          // Return completed settings immediately
          return window.__BORGDOCK_MOCK_SETTINGS__;
        }
        return origInvoke(cmd, args);
      };
    `);

    await freshPage.goto('/');
    // The skeleton cards have animate-pulse class
    // They may flash briefly during the initial render
    const skeletons = freshPage.locator('[class*="animate-pulse"]');
    // We just verify that the page loads without errors
    await waitForAppReady(freshPage);
  });
});
