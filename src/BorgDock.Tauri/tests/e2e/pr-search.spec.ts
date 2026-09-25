import { expect, type Page, test } from '@playwright/test';
import { MERGED_PR, SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

function railButton(page: Page, name: RegExp) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });
}

test('typing in the PR search filters the list', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await railButton(page, /^Pull requests/).click();
  await expect(page.getByText('Add cool feature')).toBeVisible();

  await page.getByRole('textbox', { name: 'Filter pull requests' }).fill('fix');

  await expect(page.getByText('Add cool feature')).toBeHidden();
  await expect(page.getByText('Fix bug')).toBeVisible();
});

test('search also filters the Needs you group and Recently closed', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  const [coolFeature, fixBug] = SAMPLE_PRS as { pullRequest: Record<string, unknown> }[];
  const awaitingMe = {
    ...coolFeature,
    pullRequest: { ...coolFeature!.pullRequest, requestedReviewers: ['me'] },
  };
  await seedMainWindow(page, { prs: [awaitingMe, fixBug] });
  await page.evaluate(async (closed) => {
    const { usePrStore } = await import('/src/stores/pr-store.ts');
    usePrStore.getState().setUsername('me');
    usePrStore.getState().setClosedPullRequests([closed]);
  }, MERGED_PR);
  await railButton(page, /^Pull requests/).click();
  await expect(page.locator('.bd-wb-group__label').first()).toHaveText('Needs you');
  await expect(page.getByText('Just merged')).toBeVisible();

  await page.getByRole('textbox', { name: 'Filter pull requests' }).fill('fix');

  await expect(page.getByText('Add cool feature')).toHaveCount(0);
  await expect(page.getByText('Just merged')).toHaveCount(0);
  await expect(page.getByText('Fix bug')).toBeVisible();
});

for (const key of ['k', 'f']) {
  test(`Ctrl+${key.toUpperCase()} focuses the PR search`, async ({ page }) => {
    await bootApp(page, '', 'happy-path');
    await seedMainWindow(page, { prs: SAMPLE_PRS });
    await railButton(page, /^Pull requests/).click();
    await expect(page.getByText('Add cool feature')).toBeVisible();

    await page.keyboard.press(`Control+${key}`);

    await expect(page.getByRole('textbox', { name: 'Filter pull requests' })).toBeFocused();
  });
}

test('Ctrl+F on Focus jumps to the PR search', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await railButton(page, /^Focus/).click();
  await expect(page.locator('.bd-focus-wb')).toBeVisible();
  await expect(page.locator('[style*="splash-fade-out"]')).toHaveCount(0);

  await page.keyboard.press('Control+f');

  await expect(page.getByRole('textbox', { name: 'Filter pull requests' })).toBeFocused();
});
