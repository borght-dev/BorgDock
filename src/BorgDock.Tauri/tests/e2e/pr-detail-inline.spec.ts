import { expect, type Page, test } from '@playwright/test';
import { getInvokeLog, type MockHandlers } from './helpers/mock-tauri';
import { seedScenario } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Full-screen PR detail inside the main window (plans/ui-overhaul-workbench.md,
 * phase 3) with `ui.layoutV3` on: a row click pushes the detail view (header
 * with the PR's title, readiness sentence, action bar, tabs), Back and Esc
 * return to the list at the same scroll position with the row still
 * selected, and "Open in window" still opens the pop-out.
 */

const ME = 'test-user';
const NOW = Date.parse('2026-05-08T10:00:00Z'); // the frozen e2e clock
const HOUR = 60 * 60 * 1000;

function makePr(number: number): unknown {
  const failing = number % 7 === 0;
  return {
    pullRequest: {
      number,
      title: `Detail change ${number}`,
      headRef: `feature/${number}`,
      headSha: `sha${number}`,
      baseRef: 'master',
      authorLogin: number % 2 === 0 ? ME : 'sasha',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(NOW - (number + 48) * HOUR).toISOString(),
      updatedAt: new Date(NOW - number * HOUR).toISOString(),
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/test-org/borgdock/pull/${number}`,
      body: `Why change ${number} matters.`,
      repoOwner: 'test-org',
      repoName: 'borgdock',
      reviewStatus: number % 5 === 0 ? 'approved' : 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    overallStatus: failing ? 'red' : 'green',
    failedCheckNames: failing ? ['ci / test'] : [],
    failedCheckSuiteIds: failing ? [1] : [],
    pendingCheckNames: [],
    passedCount: failing ? 11 : 12,
    skippedCount: 0,
    totalCheckCount: 12,
  };
}

const PRS = Array.from({ length: 40 }, (_, i) => makePr(i + 1));

function v3Handlers(): MockHandlers {
  const happy = seedScenario('happy-path');
  const settings = happy.load_settings as { ui: Record<string, unknown> };
  return { load_settings: { ...settings, ui: { ...settings.ui, layoutV3: true } } };
}

async function bootPrList(page: Page) {
  await bootApp(page, '', 'happy-path', v3Handlers());
  await seedMainWindow(page, { prs: PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-list .bd-wb-row')).toHaveCount(PRS.length);
}

/**
 * Check runs for #14 (one failing suite, one passing) and the failing job's
 * log, answered in place of the blanket GitHub mock `bootApp` installs. Like
 * GitHub Actions, the runs are named by job alone ("build", "links"); the
 * workflow runs for the head commit give their suites the names CI and Docs.
 */
async function routeChecks(page: Page) {
  const job = (id: number, name: string, conclusion: string, suite: number) => ({
    id,
    name,
    status: 'completed',
    conclusion,
    started_at: '2026-05-08T09:00:00Z',
    completed_at: '2026-05-08T09:01:05Z',
    html_url: `https://github.com/test-org/borgdock/actions/runs/${499 + suite}/job/${id}`,
    check_suite: { id: suite },
    head_sha: 'sha14',
  });
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/commits\/.+\/check-runs/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_count: 3,
        check_runs: [
          job(1001, 'build', 'success', 1),
          job(1002, 'test', 'failure', 1),
          job(1003, 'links', 'success', 2),
        ],
      }),
    }),
  );
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/actions\/runs\?head_sha=/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_count: 2,
        workflow_runs: [
          { id: 500, name: 'CI', check_suite_id: 1 },
          { id: 501, name: 'Docs', check_suite_id: 2 },
        ],
      }),
    }),
  );
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/actions\/jobs\/1002\/logs/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: [
        '2026-05-08T09:01:00.0000000Z ##[group]Run bun run typecheck',
        'src/app.ts(12,5): error TS2322: Type string is not assignable to type number.',
        '##[error]Process completed with exit code 2.',
      ].join('\n'),
    }),
  );
}

/** Push and pop run a view transition; wait for it before the next click. */
async function settled(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-view-transition', /.*/);
}

const depth = (page: Page) => page.locator('.bd-viewstack');
const detail = (page: Page) => page.locator('.bd-detail');

test('a row click opens the full-screen detail with the PR in its header', async ({ page }) => {
  await bootPrList(page);
  await page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#14"]').click();

  await expect(depth(page)).toHaveAttribute('data-depth', '2');
  await expect(
    detail(page).getByRole('heading', { level: 1, name: 'Detail change 14' }),
  ).toBeVisible();
  await expect(detail(page).getByText('test-org/borgdock')).toBeVisible();
  // #14 fails one check: the sentence says so and Rerun is the primary action.
  await expect(detail(page).locator('.bd-readiness')).toHaveText('Not ready: 1 check failing');
  await expect(detail(page).locator('[data-action-bar-action="rerun"]')).toHaveText(
    'Rerun failed',
  );
  await expect(detail(page).getByRole('button', { name: 'Back' })).toBeVisible();
  // The detail reads in Instrument Sans at 14 px.
  const font = await detail(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return { family: style.fontFamily, size: style.fontSize };
  });
  expect(font.family).toContain('Instrument Sans');
  expect(font.size).toBe('14px');

  const log = await getInvokeLog(page);
  expect(log.some((e) => e.cmd === 'open_pr_detail_window')).toBe(false);
});

test('tabs switch by click and with J / K; Checks groups by suite', async ({ page }) => {
  await bootPrList(page);
  await routeChecks(page);
  await page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#14"]').click();
  await expect(depth(page)).toHaveAttribute('data-depth', '2');

  const tab = (name: RegExp) => detail(page).getByRole('tab', { name });
  await expect(detail(page).getByRole('tablist')).toBeVisible();
  const names = await detail(page).getByRole('tab').allTextContents();
  expect(names.map((n) => n.replace(/[\d/]+$/, '').trim())).toEqual([
    'Overview',
    'Checks',
    'Files',
    'Commits',
    'Discussion',
  ]);

  await tab(/^Checks/).click();
  await expect(tab(/^Checks/)).toHaveAttribute('aria-selected', 'true');
  // The failing suite comes first and open, the passing one collapsed.
  const suites = detail(page).locator('details[data-suite]');
  await expect(suites).toHaveCount(2);
  await expect(suites.nth(0)).toHaveAttribute('data-suite', 'CI');
  await expect(suites.nth(0)).toHaveAttribute('open', '');
  await expect(suites.nth(1)).toHaveAttribute('data-suite', 'Docs');
  await expect(suites.nth(1)).not.toHaveAttribute('open', '');
  await expect(suites.nth(0).locator('[data-check-row]').first()).toHaveAttribute(
    'data-check-state',
    'failed',
  );
  await expect(detail(page).getByRole('button', { name: 'Fix with Claude' })).toHaveCount(2);
  // The first failure's log excerpt, from the job log.
  await expect(detail(page).getByRole('region', { name: 'First failure' })).toContainText(
    'Type string is not assignable to type number.',
  );

  await page.keyboard.press('j');
  await expect(tab(/^Files/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('k');
  await page.keyboard.press('k');
  await expect(tab(/^Overview/)).toHaveAttribute('aria-selected', 'true');
  await expect(detail(page).getByText('Why change 14 matters.')).toBeVisible();
});

test('Back returns to the list with the same scroll position and selection', async ({ page }) => {
  await bootPrList(page);
  const list = page.locator('.bd-wb-list');
  await list.evaluate((el) => {
    el.scrollTop = 600;
  });
  const target = page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#30"]');
  await target.scrollIntoViewIfNeeded();
  const scrollAtClick = await list.evaluate((el) => el.scrollTop);
  expect(scrollAtClick).toBeGreaterThan(0);
  await target.click();
  await expect(
    detail(page).getByRole('heading', { level: 1, name: 'Detail change 30' }),
  ).toBeVisible();

  await detail(page).getByRole('button', { name: 'Back' }).click();

  await expect(depth(page)).toHaveAttribute('data-depth', '1');
  await expect(detail(page)).toHaveCount(0);
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.bd-wb-row[data-selected="true"]')).toHaveCount(1);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollAtClick);

  // Esc goes back too.
  await settled(page);
  await target.click();
  await expect(depth(page)).toHaveAttribute('data-depth', '2');
  await settled(page);
  await page.keyboard.press('Escape');
  await expect(depth(page)).toHaveAttribute('data-depth', '1');
  await expect(target).toHaveAttribute('data-selected', 'true');
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollAtClick);
});

test('"Open in window" opens the pop-out and returns to the list', async ({ page }) => {
  await bootPrList(page);
  await page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#10"]').click();
  await expect(depth(page)).toHaveAttribute('data-depth', '2');

  await detail(page).getByRole('button', { name: 'Open in window' }).click();

  await expect
    .poll(async () =>
      (await getInvokeLog(page)).some((e) => {
        const a = e.args as { owner?: string; repo?: string; number?: number } | undefined;
        return (
          e.cmd === 'open_pr_detail_window' &&
          a?.owner === 'test-org' &&
          a?.repo === 'borgdock' &&
          a?.number === 10
        );
      }),
    )
    .toBe(true);
  await expect(depth(page)).toHaveAttribute('data-depth', '1');
});

test('Esc closes the "More" menu first, and only the next Esc goes back', async ({ page }) => {
  await bootPrList(page);
  await page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#10"]').click();
  await expect(depth(page)).toHaveAttribute('data-depth', '2');
  await settled(page);

  await detail(page).getByRole('button', { name: 'More actions' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(depth(page)).toHaveAttribute('data-depth', '2');

  await page.keyboard.press('Escape');
  await expect(depth(page)).toHaveAttribute('data-depth', '1');
});
