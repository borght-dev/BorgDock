import { expect, type Page, test } from '@playwright/test';
import { getInvokeLog, type MockHandlers } from './helpers/mock-tauri';
import { seedScenario } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Focus in the Workbench layout (plans/ui-overhaul-workbench.md, phase 5)
 * with `ui.layoutV3` on: the count strip filters the list, List / Board is
 * saved to `ui.focusLayout`, the Board puts every PR in its computed column,
 * Merge on a ready card runs to "Merged" and bumps the "Merged today" tally,
 * and Review opens Quick Review.
 *
 * The seeded user is `test-user` (the happy-path `check_github_auth`).
 */

const ME = 'test-user';
const NOW = Date.parse('2026-05-08T10:00:00Z'); // the frozen e2e clock
const HOUR = 60 * 60 * 1000;

interface Spec {
  number: number;
  author?: string;
  status?: 'red' | 'green';
  reviewStatus?: string;
  requestedReviewers?: string[];
  hoursAgo: number;
}

function makePr(spec: Spec): unknown {
  const status = spec.status ?? 'green';
  return {
    pullRequest: {
      number: spec.number,
      title: `Focus change ${spec.number}`,
      headRef: `feature/${spec.number}`,
      headSha: `sha${spec.number}`,
      baseRef: 'master',
      authorLogin: spec.author ?? ME,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(NOW - (spec.hoursAgo + 48) * HOUR).toISOString(),
      updatedAt: new Date(NOW - spec.hoursAgo * HOUR).toISOString(),
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/test-org/borgdock/pull/${spec.number}`,
      body: '',
      repoOwner: 'test-org',
      repoName: 'borgdock',
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
    pendingCheckNames: [],
    passedCount: status === 'green' ? 12 : 11,
    skippedCount: 0,
    totalCheckCount: 12,
  };
}

/** Where each PR belongs on the Board. */
const COLUMNS = {
  you: [1, 2, 3],
  wait: [6, 7],
  ready: [4, 5],
  stale: [8, 9],
};

const PRS = [
  // Needs you: my failing PR, a review requested from me, changes on mine.
  makePr({ number: 1, status: 'red', hoursAgo: 2 }),
  makePr({ number: 2, author: 'mira', requestedReviewers: [ME], hoursAgo: 3 }),
  makePr({ number: 3, reviewStatus: 'changesRequested', hoursAgo: 4 }),
  // Ready to merge: approved and green, mine and someone else's.
  makePr({ number: 4, reviewStatus: 'approved', hoursAgo: 5 }),
  makePr({ number: 5, author: 'sasha', reviewStatus: 'approved', hoursAgo: 30 }),
  // Waiting on others: someone else's quiet PR, mine waiting on a reviewer.
  makePr({ number: 6, author: 'jules', hoursAgo: 30 }),
  makePr({ number: 7, requestedReviewers: ['mira'], hoursAgo: 30 }),
  // Stale: no update in a week or more.
  makePr({ number: 8, author: 'sasha', hoursAgo: 10 * 24 }),
  makePr({ number: 9, hoursAgo: 12 * 24 }),
];

function v3Handlers(): MockHandlers {
  const happy = seedScenario('happy-path');
  const settings = happy.load_settings as { ui: Record<string, unknown> };
  return { load_settings: { ...settings, ui: { ...settings.ui, layoutV3: true } } };
}

/** Accepts the merge of #4 and answers its refresh as merged; records the merge calls. */
async function routeMerge(page: Page) {
  const merges: string[] = [];
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/pulls\/4(\/|\?|$)/, (route) => {
    const url = route.request().url();
    if (url.includes('/merge')) {
      merges.push(route.request().method());
      return route.fulfill({ status: 200, json: { merged: true, sha: 'merged4' } });
    }
    if (/\/(reviews|comments|files|commits)(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        number: 4,
        title: 'Focus change 4',
        head: { sha: 'sha4', ref: 'feature/4' },
        base: { ref: 'master' },
        user: { login: ME },
        state: 'closed',
        merged_at: new Date(NOW).toISOString(),
        closed_at: new Date(NOW).toISOString(),
        created_at: new Date(NOW - 53 * HOUR).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        html_url: 'https://github.com/test-org/borgdock/pull/4',
        draft: false,
        labels: [],
      },
    });
  });
  return merges;
}

async function bootFocus(page: Page) {
  await bootApp(page, '', 'happy-path', v3Handlers());
  const merges = await routeMerge(page);
  await seedMainWindow(page, { prs: PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Focus/ })
    .click();
  await expect(page.locator('.bd-focus-wb')).toBeVisible();
  return merges;
}

async function showBoard(page: Page) {
  await page
    .getByRole('group', { name: 'Focus layout' })
    .getByRole('button', { name: 'Board' })
    .click();
  await expect(page.locator('[data-focus-board]')).toBeVisible();
}

function columnNumbers(page: Page, col: string) {
  return page
    .locator(`[data-col="${col}"] .bd-fb-card`)
    .evaluateAll((cards) => cards.map((c) => Number((c as HTMLElement).dataset.prNumber)));
}

test('the count strip filters Focus, and the Board puts each PR in its column', async ({
  page,
}) => {
  await bootFocus(page);
  const rows = page.locator('.bd-focus-list .bd-wb-row');
  await expect(rows).toHaveCount(PRS.length);

  const strip = page.getByRole('group', { name: 'Filter Focus' });
  await strip.getByRole('button', { name: /^Needs you/ }).click();
  await expect(rows).toHaveCount(COLUMNS.you.length);
  await strip.getByRole('button', { name: /^Ready to merge/ }).click();
  await expect(rows).toHaveCount(COLUMNS.ready.length);
  const readyRows = await rows.evaluateAll((els) =>
    els.map((el) => Number((el as HTMLElement).dataset.prNumber)),
  );
  expect(readyRows.sort()).toEqual(COLUMNS.ready);
  await expect(strip.getByRole('button', { name: /^Ready to merge/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: test.info().outputPath('focus-list-ready.png') });
  await strip.getByRole('button', { name: /^Everything/ }).click();
  await expect(rows).toHaveCount(PRS.length);

  await showBoard(page);
  for (const [col, numbers] of Object.entries(COLUMNS)) {
    expect((await columnNumbers(page, col)).sort((a, b) => a - b)).toEqual(numbers);
  }
  await expect(page.locator('[data-col="stale"] .bd-fb-card--compact')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('focus-board.png') });

  // The layout is saved with the settings.
  await expect
    .poll(async () =>
      (await getInvokeLog(page)).some(
        (e) =>
          e.cmd === 'save_settings' &&
          (e.args as { settings?: { ui?: { focusLayout?: string } } }).settings?.ui
            ?.focusLayout === 'board',
      ),
    )
    .toBe(true);
});

test('Merge on a ready card completes and the Merged today tally increments', async ({
  page,
}) => {
  const merges = await bootFocus(page);
  await showBoard(page);
  const tally = page.locator('[data-merged-today]');
  await expect(tally).toHaveAttribute('data-merged-today', '0');

  const card = page.locator('.bd-fb-card[data-pr-number="4"]');
  await card.getByRole('button', { name: 'Merge #4' }).click();
  await expect(card.getByRole('button', { name: 'Merge #4' })).toHaveText('Merged');
  await page.screenshot({ path: test.info().outputPath('focus-board-merged.png') });

  await expect(card).toHaveCount(0);
  await expect(tally).toHaveAttribute('data-merged-today', '1');
  await expect(page.locator('.bd-focus-done__count')).toHaveText('1');
  expect(await columnNumbers(page, 'ready')).toEqual([5]);
  expect(merges).toEqual(['PUT']);
});

test('Review on a card opens Quick Review for that PR', async ({ page }) => {
  await bootFocus(page);
  await showBoard(page);
  await page
    .locator('.bd-fb-card[data-pr-number="2"]')
    .getByRole('button', { name: 'Review #2' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Quick Review' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('article', { name: 'Pull request #2' })).toBeVisible();
  // Review opened Quick Review, not the detail view.
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
});
