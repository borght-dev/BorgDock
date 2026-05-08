import { expect, test } from '@playwright/test';
import { FAILING_PR, SAMPLE_PRS } from './helpers/seed';
import { bootApp, expectInvoked, seedMainWindow } from './helpers/test-utils';

/**
 * Main-window PR list:
 *   - renders seeded PRs by title
 *   - clicking a PR card fires open_pr_detail_window with { owner, repo, number }
 *
 * Selectors are intentionally text-based (the PR card's title is rendered
 * as flowing text inside a role=button container; no `data-testid` exists
 * on the card itself). PR list filter/sort/group buttons are not asserted
 * — they vary by feature flag and aren't core to "did the list render".
 *
 * Why we seed twice (mock IPC + __borgdock_test_seed):
 *   The init sequence pulls PRs from the SQLite cache (via cache_load_prs)
 *   and then kicks off a background GitHub API refresh that overwrites the
 *   store with whatever the routed network mock returns (an empty list).
 *   Seeding through `__borgdock_test_seed` AFTER bootApp pins the store
 *   contents past the background refresh.
 */

test('PR list renders seeded PRs', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  // Switch to the PRs tab — focus is the default.
  await page.getByRole('tab', { name: 'PRs' }).click();
  await expect(page.getByText('Add cool feature')).toBeVisible();
  await expect(page.getByText('Fix bug')).toBeVisible();
});

test('clicking a PR opens detail window', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page.getByRole('tab', { name: 'PRs' }).click();
  await page.getByText('Add cool feature').click();
  await expectInvoked(page, 'open_pr_detail_window', (args) => {
    if (typeof args !== 'object' || args === null) return false;
    const a = args as { owner?: string; repo?: string; number?: number };
    return a.owner === 'test-org' && a.repo === 'borgdock' && a.number === 42;
  });
});

test('failing-checks scenario shows the failing PR', async ({ page }) => {
  await bootApp(page, '', 'failing-checks');
  await seedMainWindow(page, { prs: [FAILING_PR, ...SAMPLE_PRS] });
  await page.getByRole('tab', { name: 'PRs' }).click();
  await expect(page.getByText('WIP: red checks')).toBeVisible();
});
