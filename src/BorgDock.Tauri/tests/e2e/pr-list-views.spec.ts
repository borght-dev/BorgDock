import { expect, type Page, test } from '@playwright/test';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * The Pull requests list's views (design/pr-overview/mockups.html): query
 * qualifiers as chips, the Filter menu, sortable column headings, saved
 * views, and the board layout.
 *
 * The seeded user is `test-user` (the happy-path `check_github_auth`).
 */

const ME = 'test-user';
const NOW = Date.parse('2026-05-08T10:00:00Z'); // the frozen e2e clock
const HOUR = 60 * 60 * 1000;

interface Spec {
  number: number;
  author?: string;
  status?: 'red' | 'yellow' | 'green';
  reviewStatus?: string;
  requestedReviewers?: string[];
  repoName?: string;
  additions?: number;
  title?: string;
}

function makePr(spec: Spec): unknown {
  const status = spec.status ?? 'green';
  const repoName = spec.repoName ?? 'borgdock';
  return {
    pullRequest: {
      number: spec.number,
      title: spec.title ?? `View change ${spec.number}`,
      headRef: `feature/${spec.number}`,
      headSha: `sha${spec.number}`,
      baseRef: 'main',
      authorLogin: spec.author ?? ME,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(NOW - (spec.number + 48) * HOUR).toISOString(),
      updatedAt: new Date(NOW - spec.number * HOUR).toISOString(),
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/test-org/${repoName}/pull/${spec.number}`,
      body: '',
      repoOwner: 'test-org',
      repoName,
      reviewStatus: spec.reviewStatus ?? 'none',
      commentCount: 0,
      labels: [],
      additions: spec.additions ?? 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: spec.requestedReviewers ?? [],
    },
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['ci / test'] : [],
    failedCheckSuiteIds: status === 'red' ? [1] : [],
    pendingCheckNames: status === 'yellow' ? ['ci / build'] : [],
    passedCount: status === 'green' ? 12 : 11,
    skippedCount: 0,
    totalCheckCount: 12,
  };
}

/**
 * 8 PRs: two of mine failing, two waiting on my review (borgdock and site),
 * one approved and green (ready), and three others in site.
 */
const PRS = [
  makePr({ number: 1, status: 'red', additions: 400 }),
  makePr({ number: 2, status: 'red', repoName: 'site' }),
  makePr({ number: 3, author: 'mira', requestedReviewers: [ME] }),
  makePr({ number: 4, author: 'mira', requestedReviewers: [ME], repoName: 'site', additions: 900 }),
  makePr({ number: 5, author: 'sasha', reviewStatus: 'approved' }),
  makePr({ number: 6, author: 'sasha', repoName: 'site', title: 'Alpha first by title' }),
  makePr({ number: 7, author: 'jules', repoName: 'site', status: 'yellow' }),
  makePr({ number: 8, author: 'jules', repoName: 'site' }),
];

async function boot(page: Page) {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-list .bd-wb-row')).toHaveCount(PRS.length);
}

const rows = (page: Page) => page.locator('.bd-wb-list .bd-wb-row');
const search = (page: Page) => page.getByRole('textbox', { name: 'Filter pull requests' });

for (const menu of ['group', 'sort']) {
  test(`${menu} menu rows contain their wrapped descriptions`, async ({ page }) => {
    await boot(page);
    await page.locator(`[data-${menu}-button]`).click();
    const items = page.getByRole('menuitemradio');
    await expect(items.first()).toBeVisible();
    const overflowing = await items.evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const row = button.getBoundingClientRect();
        const text = button.querySelector('.bd-prl-radio__text')!.getBoundingClientRect();
        return text.top < row.top || text.bottom > row.bottom
          ? [button.textContent]
          : [];
      }),
    );
    await page.screenshot({ path: `test-results/pr-${menu}-menu.png` });
    expect(overflowing).toEqual([]);
  });
}

test('save view stays visible when the view tabs overflow', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 900 });
  await boot(page);
  expect(
    await page.getByRole('tablist', { name: 'Pull request views' }).evaluate(
      (tabs) => tabs.scrollWidth > tabs.clientWidth,
    ),
  ).toBe(true);
  const save = page.getByRole('button', { name: /^View$/ });
  await expect(save).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'test-results/pr-save-view.png' });
  await save.click();
  await page.getByRole('textbox', { name: 'View name' }).fill('Narrow view');
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByRole('tab', { name: /^Narrow view/ })).toHaveAttribute(
    'aria-selected', 'true',
  );
});

test('large groups use the available list height and resize with the window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await boot(page);
  await seedMainWindow(page, {
    prs: Array.from({ length: 56 }, (_, index) => makePr({ number: index + 1, author: 'mira' })),
  });
  await page.locator('[data-group-button]').click();
  await page.getByRole('menuitemradio', { name: /^Author/ }).click();
  const virtual = page.locator('[data-virtual-prs="56"]');
  await expect(virtual).toBeVisible();
  const availableHeight = () => page.locator('.bd-wb-list').evaluate((list) => list.clientHeight);
  await expect.poll(async () => (await virtual.boundingBox())!.height).toBeGreaterThan(
    (await availableHeight()) - 30,
  );
  await page.screenshot({ path: 'test-results/pr-group-height.png' });
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect.poll(async () => (await virtual.boundingBox())!.height).toBeLessThanOrEqual(
    await availableHeight(),
  );
  expect(await virtual.locator('.bd-wb-row').count()).toBeLessThan(56);
});

test('qualifiers in the search become chips; × removes one', async ({ page }) => {
  await boot(page);
  await search(page).fill('repo:site author:jules');
  await search(page).press('Enter');

  await expect(page.locator('[data-filter-chip="repo"]')).toContainText('Repository');
  await expect(page.locator('[data-filter-chip="repo"]')).toContainText('site');
  await expect(page.locator('[data-filter-chip="author"]')).toContainText('jules');
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Remove Author filter' }).click();
  await expect(search(page)).toHaveValue('repo:site');
  await expect(rows(page)).toHaveCount(5);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(search(page)).toHaveValue('');
  await expect(rows(page)).toHaveCount(PRS.length);
});

test('the Filter menu adds a value with its count', async ({ page }) => {
  await boot(page);
  await page.locator('[data-add-filter]').click();
  await page.getByRole('menuitem', { name: /^Repository/ }).click();
  const site = page.getByRole('menuitemcheckbox', { name: /site/ });
  await expect(site.locator('.bd-prl-value__count')).toHaveText('5');
  await site.click();
  await expect(site).toHaveAttribute('aria-checked', 'true');
  await expect(search(page)).toHaveValue('repo:site');
  await expect(rows(page)).toHaveCount(5);
});

test('a column heading sorts, a second click reverses', async ({ page }) => {
  await boot(page);
  // One flat list, so the order is the sort's alone.
  await page.locator('[data-group-button]').click();
  await page.getByRole('menuitemradio', { name: /^No grouping/ }).click();

  const size = page.locator('[data-table-head] [data-col="size"]');
  await size.click();
  await expect(size).toHaveAttribute('aria-sort', 'descending');
  await expect(rows(page).first()).toHaveAttribute('data-pr-number', '4');
  await size.click();
  await expect(size).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows(page).last()).toHaveAttribute('data-pr-number', '4');

  await page.locator('[data-table-head] [data-col="title"]').click();
  await expect(rows(page).first()).toHaveAttribute('data-pr-number', '6');
});

test('a saved view keeps the tab, the query and the display', async ({ page }) => {
  await boot(page);
  await search(page).fill('repo:site');
  await search(page).press('Enter');
  await page.locator('[data-group-button]').click();
  await page.getByRole('menuitemradio', { name: /^Author/ }).click();

  await page.getByRole('button', { name: /^View$/ }).click();
  await page.getByRole('textbox', { name: 'View name' }).fill('Site work');
  await page.getByRole('button', { name: 'Save view' }).click();

  const saved = page.getByRole('tab', { name: /^Site work/ });
  await expect(saved).toHaveAttribute('aria-selected', 'true');
  await expect(saved.locator('.bd-prl-tab__count')).toHaveText('5');

  // Back to All: the view's query goes with it; All keeps a grouping of its own.
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(search(page)).toHaveValue('');
  await expect(rows(page)).toHaveCount(PRS.length);
  await page.locator('[data-group-button]').click();
  await page.getByRole('menuitemradio', { name: /^Status/ }).click();
  await expect(page.locator('[data-group-button]')).toContainText('Status');

  // The view comes back with its own.
  await saved.click();
  await expect(search(page)).toHaveValue('repo:site');
  await expect(page.locator('[data-group-button]')).toContainText('Author');

  // A change marks the view edited until it is saved.
  await search(page).fill('repo:site author:jules');
  await search(page).press('Enter');
  await expect(page.locator('.bd-prl-tab__edited')).toBeVisible();
  await page.locator('[data-update-view]').click();
  await expect(page.locator('.bd-prl-tab__edited')).toHaveCount(0);
  await expect(saved.locator('.bd-prl-tab__count')).toHaveText('2');
});

test('the board shows one column per status; a card opens the PR', async ({ page }) => {
  await boot(page);
  await page.locator('[data-display-button]').click();
  await page.locator('[data-layout-option="board"]').click();
  await page.keyboard.press('Escape');

  const board = page.locator('[data-board]');
  await expect(board).toBeVisible();
  await expect(board.locator('.bd-prl-col__label')).toHaveText([
    'Your turn',
    'Waiting for review',
    'Ready to merge',
  ]);
  await expect(board.locator('.bd-prl-card')).toHaveCount(PRS.length);
  await expect(page.locator('[data-table-head]')).toHaveCount(0);

  await board.locator('.bd-prl-card[data-pr-number="5"]').click();
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '2');
});

test('J walks the board column by column', async ({ page }) => {
  await boot(page);
  await page.locator('[data-display-button]').click();
  await page.locator('[data-layout-option="board"]').click();
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Pull requests' }).click();

  const firstColumn = page.locator('.bd-prl-col').first().locator('.bd-prl-card');
  const count = await firstColumn.count();
  for (let i = 0; i < count; i++) await page.keyboard.press('j');
  await expect(firstColumn.last()).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('j');
  await expect(page.locator('.bd-prl-col').nth(1).locator('.bd-prl-card').first()).toHaveAttribute(
    'data-selected',
    'true',
  );
});
