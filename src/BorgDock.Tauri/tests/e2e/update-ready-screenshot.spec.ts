import { expect, test } from '@playwright/test';
import { bootApp, expectInvoked } from './helpers/test-utils';

test('capture update ready state', async ({ page }) => {
  await bootApp(page, 'settings.html', 'happy-path');
  await page.getByRole('button', { name: /^Updates$/ }).click();
  await expect(page.getByText('Not checked yet')).toBeVisible();
  await page.evaluate(async () => {
    const { useUpdateStore } = await import('/src/stores/update-store.ts');
    useUpdateStore.getState().setStatus({
      phase: 'available',
      currentVersion: '3.0.0',
      version: '3.0.1',
      progress: 0,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    });
  });
  await expect(page.getByRole('button', { name: 'Download v3.0.1' })).toBeVisible();
  await expect(page.getByText('Last checked just now')).toBeVisible();
  await page.screenshot({ path: 'test-results/update-available.png' });
  await page.evaluate(async () => {
    const { useUpdateStore } = await import('/src/stores/update-store.ts');
    const status = useUpdateStore.getState();
    status.setStatus({
      phase: 'ready',
      currentVersion: status.currentVersion,
      version: status.version,
      progress: 100,
      lastCheckedAt: status.lastCheckedAt,
      lastError: null,
    });
  });
  await expect(page.getByText('Update ready — restart to apply')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart to apply' })).toBeVisible();
  await page.screenshot({ path: 'test-results/update-ready.png' });
  await page.getByRole('button', { name: 'Restart to apply' }).click();
  await expectInvoked(page, 'restart_to_apply_update');
});
