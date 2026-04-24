import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';

test.describe('sql window', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/sql.html');
    await waitForAppReady(page);
  });

  test('renders the editor and connection select', async ({ page }) => {
    await expect(page.locator('[data-sql-editor]')).toBeVisible();
    await expect(page.locator('[data-sql-connection-select]')).toBeVisible();
  });

  test('run button is disabled until a connection is picked', async ({ page }) => {
    const runBtn = page.locator('[data-action="run-query"]');
    await expect(runBtn).toBeDisabled();
  });

  test('typing in the editor updates the model', async ({ page }) => {
    const editor = page.locator('[data-sql-editor] textarea, [data-sql-editor] [contenteditable]');
    await editor.click();
    await page.keyboard.type('SELECT 1');
    await expect(editor).toContainText('SELECT 1');
  });

  test('results table renders after mock run', async ({ page }) => {
    // NOTE: This test is only half-real — the SQL store doesn't yet seed
    // connections via __borgdock_test_seed, so the run effectively no-ops.
    // PR #5 (palettes migration) will add connection fixtures; this test
    // will then meaningfully assert result-table render.
    // With the mock connection seeded via completedSettings, a run should
    // return the mock result set.
    await page.selectOption('[data-sql-connection-select]', { index: 1 }).catch(() => {});
    const editor = page.locator('[data-sql-editor] textarea, [data-sql-editor] [contenteditable]');
    await editor.click();
    await page.keyboard.type('SELECT 1');
    await page.locator('[data-action="run-query"]').click();
    await expect(page.locator('[data-sql-results-table] tbody tr').first())
      .toBeVisible({ timeout: 3_000 });
  });
});
