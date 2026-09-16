import { expect, test } from '@playwright/test';
import { MERGED_PR, SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

test('typing in the PR search filters the list', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page.getByRole('tab', { name: 'PRs' }).click();
  await expect(page.getByText('Add cool feature')).toBeVisible();

  await page.getByLabel('Filter pull requests').fill('fix');

  await expect(page.getByText('Add cool feature')).toBeHidden();
  await expect(page.getByText('Fix bug')).toBeVisible();
});

test('search also filters the review queue and recently closed', async ({ page }) => {
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
  await page.getByRole('tab', { name: 'PRs' }).click();
  await expect(page.getByText('Needs Your Review')).toBeVisible();
  await expect(page.getByText('Just merged')).toBeVisible();

  await page.getByLabel('Filter pull requests').fill('fix');

  await expect(page.getByText('Add cool feature')).toHaveCount(0);
  await expect(page.getByText('Just merged')).toHaveCount(0);
  await expect(page.getByText('Fix bug')).toBeVisible();
});

for (const key of ['k', 'f']) {
  test(`Ctrl+${key.toUpperCase()} focuses the PR search`, async ({ page }) => {
    await bootApp(page, '', 'happy-path');
    await seedMainWindow(page, { prs: SAMPLE_PRS });
    await page.getByRole('tab', { name: 'PRs' }).click();
    await expect(page.getByText('Add cool feature')).toBeVisible();

    await page.keyboard.press(`Control+${key}`);

    await expect(page.getByLabel('Filter pull requests')).toBeFocused();
  });
}

test('Ctrl+F on Focus jumps to the PR search', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });

  await page.keyboard.press('Control+f');

  await expect(page.getByLabel('Filter pull requests')).toBeFocused();
});
