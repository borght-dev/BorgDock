import { expect, test } from '@playwright/test';
import { bootApp, expectInvoked } from './helpers/test-utils';

test('capture update ready state', async ({ page }) => {
  await bootApp(page, 'settings.html', 'happy-path');
  await page.getByRole('button', { name: /^Updates$/ }).click();
  await page.evaluate(async () => {
    const { useUpdateStore } = await import('/src/stores/update-store.ts');
    useUpdateStore.getState().setAvailable('3.0.1');
  });
  await expect(page.getByRole('button', { name: 'Download v3.0.1' })).toBeVisible();
  await page.screenshot({ path: 'test-results/update-available.png' });
  await page.evaluate(async () => {
    const { useUpdateStore } = await import('/src/stores/update-store.ts');
    useUpdateStore.getState().setProgress(100);
    useUpdateStore.getState().setStatusText('Update ready — restart to apply');
  });
  await expect(page.getByText('Update ready — restart to apply')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart to apply' })).toBeVisible();
  await page.screenshot({ path: 'test-results/update-ready.png' });
  await page.getByRole('button', { name: 'Restart to apply' }).click();
  await expectInvoked(page, 'restart_to_apply_update');
});
