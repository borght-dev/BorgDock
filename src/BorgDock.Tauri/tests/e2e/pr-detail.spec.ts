import { expect, test } from '@playwright/test';
import { MERGED_PR, SAMPLE_PRS } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

/**
 * PR detail pop-out window. The PR is selected via URL query
 * `?owner=<owner>&repo=<repo>&number=<n>` (see PRDetailApp.tsx).
 *
 * Tabs are role=tab buttons via the Tabs primitive
 * (see PRDetailPanel.tsx, line 38: `role="tablist"`).
 */

const PR_DETAIL_QUERY = '?owner=test-org&repo=borgdock&number=42';

test('detail renders the seeded PR title', async ({ page }) => {
  await bootApp(page, `pr-detail.html${PR_DETAIL_QUERY}`, 'happy-path', {
    cache_load_prs: SAMPLE_PRS,
  });
  await expect(page.getByText('Add cool feature')).toBeVisible();
});

test('detail shows merged banner for merged PR', async ({ page }) => {
  await bootApp(page, 'pr-detail.html?owner=test-org&repo=borgdock&number=45', 'merged-pr-celebration', {
    cache_load_prs: [MERGED_PR],
  });
  // Merged-state copy is "Merged" / "merged" depending on banner vs status pill —
  // accept any case-insensitive occurrence.
  await expect(page.getByText(/merged/i).first()).toBeVisible();
});

test('detail tabs are reachable and selectable', async ({ page }) => {
  await bootApp(page, `pr-detail.html${PR_DETAIL_QUERY}`, 'happy-path', {
    cache_load_prs: SAMPLE_PRS,
  });
  const tabs = page.getByRole('tab');
  await expect(tabs).not.toHaveCount(0);
  const count = await tabs.count();
  // Click the second tab if present and confirm it becomes aria-selected.
  if (count >= 2) {
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  }
});
