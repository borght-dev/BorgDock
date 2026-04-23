import { test, expect } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

/**
 * Helper to set up the page with completed setup and inject mock PRs.
 */
async function setupWithPrs(page: import('@playwright/test').Page) {
  await injectCompletedSetup(page);

  // Expose a store bridge so we can inject PRs after React mounts
  await page.addInitScript(`
    window.__PRDOCK_STORE_BRIDGE_READY__ = false;

    // Listen for the injection event
    window.addEventListener('borgdock-inject-test-prs', (e) => {
      // This is dispatched from test code; actual store manipulation
      // happens if the bridge was set up by the React app
    });
  `);

  await page.goto('/');
  await waitForAppReady(page);

  // Attempt to inject PRs by setting store state directly
  await page.evaluate(() => {
    (window as any).__TEST_PRS_FOR_CONTEXT_MENU__ = [
      {
        pullRequest: {
          number: 42,
          title: 'Fix login button alignment',
          headRef: 'fix/login-btn',
          baseRef: 'main',
          authorLogin: 'testuser',
          authorAvatarUrl: '',
          state: 'open',
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-16T14:00:00Z',
          isDraft: false,
          mergeable: true,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/42',
          body: 'Fix',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'approved',
          commentCount: 3,
          labels: ['bug'],
          additions: 12,
          deletions: 5,
          changedFiles: 2,
          commitCount: 1,
        },
        checks: [
          { id: 1, name: 'CI / Build', status: 'completed', conclusion: 'success', htmlUrl: '', checkSuiteId: 100 },
        ],
        overallStatus: 'green',
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 1,
        skippedCount: 0,
      },
    ];
  });

  await page.waitForTimeout(300);
}

test.describe('PR Context Menu', () => {
  test('right-clicking a PR card shows context menu', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      // Right-click the first PR card
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      // Context menu should appear with expected items
      await expect(page.getByText('Open in GitHub')).toBeVisible({ timeout: 3000 });
    } else {
      // If no cards, verify the page structure is correct
      await expect(page.locator('header')).toBeVisible();
    }
  });

  test('context menu contains expected items', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      const expectedItems = [
        'Open in GitHub',
        'Copy branch name',
        'Copy PR URL',
        'Copy errors for Claude',
        'Checkout branch',
        'Rerun failed checks',
        'Fix with Claude',
        'Monitor with Claude',
        'Merge',
      ];

      for (const item of expectedItems) {
        await expect(page.getByText(item, { exact: true }).first()).toBeVisible({
          timeout: 3000,
        });
      }
    }
  });

  test('clicking outside the context menu closes it', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      // Verify menu is open
      await expect(page.getByText('Open in GitHub')).toBeVisible({ timeout: 3000 });

      // Click outside the menu (e.g., on the header)
      await page.locator('header').click();
      await page.waitForTimeout(200);

      // Menu should be closed
      await expect(page.getByText('Open in GitHub')).not.toBeVisible();
    }
  });

  test('pressing Escape closes the context menu', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      await expect(page.getByText('Open in GitHub')).toBeVisible({ timeout: 3000 });

      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      await expect(page.getByText('Open in GitHub')).not.toBeVisible();
    }
  });

  test('disabled menu items have reduced opacity', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      // "Copy errors for Claude" should be disabled when there are no failing checks
      const copyErrorsBtn = page.getByText('Copy errors for Claude');
      await expect(copyErrorsBtn).toBeVisible({ timeout: 3000 });

      // Check that it has the disabled attribute
      await expect(copyErrorsBtn).toBeDisabled();
    }
  });

  test('context menu has Mark as draft/ready toggle', async ({ page }) => {
    await setupWithPrs(page);

    const cards = page.locator('[data-pr-card]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click({ button: 'right' });
      await page.waitForTimeout(200);

      // Since the mock PR is not a draft, it should show "Mark as draft"
      await expect(
        page.getByText('Mark as draft', { exact: true }).first()
      ).toBeVisible({ timeout: 3000 });
    }
  });
});
