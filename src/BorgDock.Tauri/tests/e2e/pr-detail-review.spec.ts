import { expect, test, type Page } from '@playwright/test';
import type { PullRequestWithChecks } from '../../src/types';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

const filenames = [
  'FSP/FSP.Portal/src/components/planboard/PlanboardScheduler.test.tsx',
  'FSP/FSP.Portal/src/components/planboard/PlanboardScheduler.tsx',
  'FSP/FSP.Portal/src/components/planboard/bryntum-fsp-theme.scss',
  'FSP/FSP.Portal/e2e/tests/planboard/planboard-order-tooltip-drag-suppression.spec.ts',
  'FSP/FSP.Portal/e2e/test-mapping.json',
  'docs/customer/operations/planboard.md',
  'docs/internal/features/planboard.md',
  'FSP.Tests/PlanboardTests.cs',
];
const pendingPr = {
  ...(SAMPLE_PRS[0] as PullRequestWithChecks),
  overallStatus: 'red',
  pullRequest: {
    ...(SAMPLE_PRS[0] as PullRequestWithChecks).pullRequest,
    title: 'Suppress the order hover card while dragging',
    changedFiles: filenames.length,
    mergeable: false,
  },
};
async function mockChanges(page: Page) {
  await page.route('https://api.github.com/repos/test-org/borgdock/pulls/42**', (route) => {
    const url = route.request().url();
    if (url.includes('/files'))
      return route.fulfill({
        json: filenames.map((filename, i) => ({
          filename,
          sha: `file${i}`,
          status: 'modified',
          additions: 3,
          deletions: 1,
          patch:
            '@@ -1,2 +1,4 @@\n export function isDragging() {\n-  return false;\n+  return dragState.active;\n+}\n+export const delay = 300;',
        })),
      });
    if (url.includes('/commits') || url.includes('/comments') || url.includes('/reviews'))
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        number: 42,
        title: pendingPr.pullRequest.title,
        head: { sha: 'sha42', ref: 'feature/42' },
        base: { sha: 'base', ref: 'master' },
        user: { login: 'author' },
        state: 'open',
        html_url: pendingPr.pullRequest.htmlUrl,
        body: 'Keep order tooltips hidden while a drag is active.',
        changed_files: filenames.length,
        additions: 24,
        deletions: 8,
        commits: 1,
        labels: [],
      },
    });
  });
}

test('detail file navigator groups readable names and launches a single PR review in its own window', async ({
  page,
}) => {
  await bootApp(page, 'pr-detail.html?owner=test-org&repo=borgdock&number=42', 'happy-path', {
    cache_load_prs: [pendingPr],
  });
  await mockChanges(page);
  await page.getByRole('tab', { name: /^Files/ }).click();
  const nav = page.getByRole('navigation', { name: 'Changed files' });
  await expect(nav.locator('[data-file-tree-row]')).toHaveCount(filenames.length);
  const groups = await nav
    .locator('[data-file-group]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-file-group')));
  expect(groups.at(-1)).toBe('Tests');
  expect(groups.at(-2)).toBe('Documentation');
  const rows = await nav
    .locator('[data-file-tree-row]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-filename')));
  expect(
    await page
      .locator('[data-diff-file]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-filename'))),
  ).toEqual(rows);
  const longName = nav.getByText('planboard-order-tooltip-drag-suppression.spec.ts', {
    exact: true,
  });
  await expect(longName).toBeVisible();
  expect(await longName.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '../../design/quick-review/pr-detail-files.png' });
  await nav.getByRole('button', { name: /Tests, 3 files/ }).click();
  await expect(longName).toHaveCount(0);
  await nav.getByRole('textbox').fill('drag-suppression');
  await expect(longName).toBeVisible();
  await longName.click();
  await expect(
    page
      .locator('[data-diff-file]')
      .filter({ has: page.getByText(filenames[3]!, { exact: true }) }),
  ).toBeInViewport();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick Review', exact: true })).toBeVisible();
  await expect(page.getByText('PR 1 / 1', { exact: true })).toBeVisible();
  await expect(page.locator('.qr-next')).toBeEnabled();
  await expect(page.locator('[data-overlay="quick-review"]')).toHaveCount(1);
  await expect(page.locator('[data-quick-review-content]')).toContainText(
    'Keep order tooltips hidden',
  );
});

test('merge-ready PRs keep their enabled Merge action', async ({ page }) => {
  const readyPr = {
    ...pendingPr,
    overallStatus: 'green',
    pullRequest: { ...pendingPr.pullRequest, mergeable: true, reviewStatus: 'approved' },
  };
  await bootApp(page, 'pr-detail.html?owner=test-org&repo=borgdock&number=42', 'happy-path', {
    cache_load_prs: [readyPr],
  });
  await expect(page.getByRole('button', { name: 'Merge', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
});
