import { expect, type Page, test } from '@playwright/test';
import { getInvokeLog } from './helpers/mock-tauri';
import { FAILING_PR, SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * The pull request list (design/pr-overview/mockups.html): the table rows,
 * the view tabs (All / Your turn / Mine / Failing / Ready to merge /
 * Stale), and a row click that pushes the in-window detail view and comes
 * back to the same scroll position and selection.
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
}

function makePr(spec: Spec): unknown {
  const status = spec.status ?? 'green';
  const repoName = spec.repoName ?? 'borgdock';
  return {
    pullRequest: {
      number: spec.number,
      title: `Workbench change ${spec.number}`,
      headRef: `feature/${spec.number}`,
      headSha: `sha${spec.number}`,
      baseRef: 'master',
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
      additions: 10,
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
 * 40 PRs, enough to scroll: 2 of mine failing, 3 reviews requested from me,
 * 1 of mine with changes requested; the rest split between me and others.
 */
const PRS = Array.from({ length: 40 }, (_, i) => {
  const number = i + 1;
  if (number <= 2) return makePr({ number, status: 'red' });
  if (number <= 5) return makePr({ number, author: 'mira', requestedReviewers: [ME] });
  if (number === 6) return makePr({ number, reviewStatus: 'changesRequested' });
  if (number === 7) return makePr({ number, author: 'jules', status: 'red' });
  return makePr({
    number,
    author: number % 2 === 0 ? ME : 'sasha',
    status: number % 5 === 0 ? 'yellow' : 'green',
    repoName: number % 3 === 0 ? 'site' : 'borgdock',
  });
});

async function bootPrList(page: Page, prs: unknown[] = PRS) {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-list .bd-wb-row')).toHaveCount(prs.length);
}

const rows = (page: Page) => page.locator('.bd-wb-list .bd-wb-row');
const tab = (page: Page, name: RegExp) =>
  page.getByRole('tablist', { name: 'Pull request views' }).getByRole('tab', { name });

test('rows render as a table: status, title, meta, checks, reviews, next step', async ({
  page,
}) => {
  await bootPrList(page);

  await expect(page.getByRole('heading', { name: 'Pull requests' })).toBeVisible();
  // The default: grouped by status, Your turn first, with column headings.
  await expect(page.locator('.bd-wb-group__label').first()).toHaveText('Your turn');
  await expect(page.locator('[data-table-head]')).toBeVisible();

  await page.locator('[data-group-button]').click();
  await page.getByRole('menuitemradio', { name: /^Author/ }).click();
  await page.locator('[data-sort-button]').click();
  await page.getByRole('menuitemradio', { name: /^Created/ }).click();
  await expect(page.locator('[data-sort-button]')).toContainText('Created');
  await expect(page.locator('.bd-wb-group__label').first()).toContainText(`${ME} (you)`);
  await expect(page.locator('[data-group-key="your-turn"]')).toHaveCount(0);
  await expect(page.locator('[data-group-key="author:test-user"] .bd-wb-row')).toHaveCount(20);

  const failing = page.locator('.bd-wb-row[data-pr-number="1"]');
  await expect(failing.locator('.bd-wb-row__title')).toHaveText('Workbench change 1');
  // Grouped by author: the meta line leaves the author out.
  await expect(failing.locator('.bd-wb-row__meta')).toContainText('borgdock #1 · opened');
  await expect(failing.locator('.bd-checkbar')).toHaveText('1 failing');
  await expect(failing.locator('.bd-prl-next')).toHaveText('Fix checks');

  const requested = page.locator('.bd-wb-row[data-pr-number="3"]');
  await expect(requested.locator('.bd-prl-reviews__text')).toHaveText('Awaiting you');
  await expect(requested.locator('.bd-prl-next')).toHaveText('Your review');

  // No ring, no hover pill bar, no chips without a qualifier.
  await expect(page.locator('.bd-wb-list .bd-ring')).toHaveCount(0);
  await expect(page.locator('.bd-pr-item__actions')).toHaveCount(0);
  await expect(page.locator('[data-filter-chip]')).toHaveCount(0);
});

test('the view tabs switch and their counts match the rows', async ({ page }) => {
  await bootPrList(page);

  const expected: [RegExp, number][] = [
    [/^Your turn/, 6], // 2 failing mine + 3 requested + 1 changes requested
    [/^Mine/, 20],
    [/^Failing/, 3],
    [/^All/, 40],
  ];
  for (const [name, count] of expected) {
    const button = tab(page, name);
    await expect(button.locator('.bd-prl-tab__count')).toHaveText(String(count));
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
    await expect(rows(page)).toHaveCount(count);
  }
});

test('a row click pushes the detail view; Esc returns to the same scroll and selection', async ({
  page,
}) => {
  await bootPrList(page);
  const list = page.locator('.bd-wb-list');
  await list.evaluate((el) => {
    el.scrollTop = 600;
  });
  const scrollBefore = await list.evaluate((el) => el.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);

  // A row that is in view after scrolling.
  const target = page.locator('.bd-wb-row[data-pr-key="test-org/site#30"]');
  await target.scrollIntoViewIfNeeded();
  const scrollAtClick = await list.evaluate((el) => el.scrollTop);
  expect(scrollAtClick).toBeGreaterThan(0);
  // On the title: the check bar in the middle of the row opens the Checks tab.
  await target.locator('.bd-wb-row__title').click();

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '2');
  await expect(page.getByRole('heading', { level: 1, name: 'Workbench change 30' })).toBeVisible();
  // The click opened the in-window view, not the pop-out.
  const log = await getInvokeLog(page);
  expect(log.some((e) => e.cmd === 'open_pr_detail_window')).toBe(false);

  await page.keyboard.press('Escape');

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.bd-wb-row[data-selected="true"]')).toHaveCount(1);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollAtClick);
});

test('Ctrl+click opens the pop-out and selects only the PR of that repository', async ({ page }) => {
  // #8 exists in borgdock and, with the same number, in site.
  const twin = makePr({ number: 8, author: 'sasha', repoName: 'site' });
  await bootPrList(page, [...PRS, twin]);
  const row = page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#8"]');
  // On the title: the check bar in the middle of the row opens the Checks tab
  // instead. ControlOrMeta: on macOS, Control+click is a right-click.
  await row.locator('.bd-wb-row__title').click({ modifiers: ['ControlOrMeta'] });

  await expect
    .poll(async () =>
      (await getInvokeLog(page)).some(
        (e) =>
          e.cmd === 'open_pr_detail_window' &&
          (e.args as { repo?: string; number?: number } | undefined)?.number === 8 &&
          (e.args as { repo?: string }).repo === 'borgdock',
      ),
    )
    .toBe(true);
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(row).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.bd-wb-row[data-pr-key="test-org/site#8"]')).not.toHaveAttribute(
    'data-selected',
  );
  await expect(page.locator('.bd-wb-row[data-selected="true"]')).toHaveCount(1);
});

test('J moves the selection down the rows as drawn and Enter opens it', async ({ page }) => {
  await bootPrList(page);
  // Somewhere neutral: a click on the page centre would land on a row.
  await page.getByRole('heading', { name: 'Pull requests' }).click();

  await page.keyboard.press('j');
  const first = rows(page).first();
  await expect(first).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('j');
  await expect(rows(page).nth(1)).toHaveAttribute('data-selected', 'true');
  const number = await rows(page).nth(1).getAttribute('data-pr-number');

  await page.keyboard.press('Enter');
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '2');
  await expect(
    page.getByRole('heading', { level: 1, name: `Workbench change ${number}` }),
  ).toBeVisible();
});

test('Ctrl+Enter opens the selected row in its own window', async ({ page }) => {
  await bootPrList(page);
  await page.getByRole('heading', { name: 'Pull requests' }).click();
  await page.keyboard.press('j');
  const key = await rows(page).first().getAttribute('data-pr-key');
  const [owner, rest] = key!.split('/');
  const [repo, number] = rest!.split('#');

  await page.keyboard.press('Control+Enter');

  await expect
    .poll(async () =>
      (await getInvokeLog(page)).some((e) => {
        const a = e.args as { owner?: string; repo?: string; number?: number } | undefined;
        return (
          e.cmd === 'open_pr_detail_window' &&
          a?.owner === owner &&
          a?.repo === repo &&
          a?.number === Number(number)
        );
      }),
    )
    .toBe(true);
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
});

test('PR list renders seeded PRs', async ({ page }) => {
  await bootPrList(page, SAMPLE_PRS);
  await expect(page.getByText('Add cool feature')).toBeVisible();
  await expect(page.getByText('Fix bug')).toBeVisible();
});

test('failing-checks scenario shows the failing PR', async ({ page }) => {
  await bootApp(page, '', 'failing-checks');
  await seedMainWindow(page, { prs: [FAILING_PR, ...SAMPLE_PRS] });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-row', { hasText: 'WIP: red checks' })).toBeVisible();
  await tab(page, /^Failing/).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('WIP: red checks');
});

test('E collapses every group on screen, and a heading click opens one again', async ({
  page,
}) => {
  await bootPrList(page);
  const heads = page.locator('.bd-wb-list .bd-wb-group__head');
  const count = await heads.count();
  expect(count).toBeGreaterThan(1);
  await page.locator('.bd-wb-head__title').click();

  await page.keyboard.press('e');
  for (let i = 0; i < count; i++) {
    await expect(heads.nth(i)).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.locator('.bd-wb-list .bd-wb-group__rows[inert]')).toHaveCount(count);

  // Pressing it again keeps them collapsed; it never opens a group.
  await page.keyboard.press('e');
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'false');

  await heads.first().click();
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true');
});
