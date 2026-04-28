import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('worktree changes panel', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/worktree.html');
    await waitForAppReady(page);
  });

  test('Changes tab is reachable from the palette', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /changes/i })).toBeVisible({ timeout: 3_000 });
  });

  test('selecting a worktree then switching to Changes shows the panel', async ({ page }) => {
    await page.locator('[data-worktree-row]').first().hover();
    await page.getByRole('tab', { name: /changes/i }).click();
    await expect(page.locator('[data-worktree-changes-panel]')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('[data-changes-section="vs-head"]')).toBeVisible();
    await expect(page.locator('[data-changes-section="vs-base"]')).toBeVisible();
    await expect(page.locator('[data-base-branch="main"]')).toBeVisible();
  });

  test('clicking a file row opens the diff overlay; toggle pill flips the source', async ({ page }) => {
    await page.locator('[data-worktree-row]').first().hover();
    await page.getByRole('tab', { name: /changes/i }).click();
    await page.locator('[data-changes-section="vs-head"] [data-file-change]').first().click();
    await expect(page.locator('[data-worktree-diff-overlay]')).toBeVisible();
    await expect(page.locator('[data-diff-source-toggle]')).toBeVisible();
    await page.locator('[data-diff-source="vs-base"]').click();
    // After toggle the diff still renders; we just assert the overlay survives.
    await expect(page.locator('[data-worktree-diff-overlay]')).toBeVisible();
  });

  test('preserves existing worktree-palette contracts (regression guard)', async ({ page }) => {
    await expect(page.locator('[data-worktree-row]').first()).toBeVisible();
    await expect(page.locator('[data-action="open-terminal"]').first()).toBeVisible();
  });

  test('has no WCAG 2.1 AA violations on the Changes tab', async ({ page }) => {
    await page.locator('[data-worktree-row]').first().hover();
    await page.getByRole('tab', { name: /changes/i }).click();
    // Wait for panel to mount before scanning.
    await expect(page.locator('[data-worktree-changes-panel]')).toBeVisible({ timeout: 3_000 });
    await expectNoA11yViolations(page);
  });
});
