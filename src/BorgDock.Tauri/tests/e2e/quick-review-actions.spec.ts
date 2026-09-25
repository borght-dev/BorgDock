import { expect, type Page, test } from '@playwright/test';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Quick Review from the pull request list (plans/ui-overhaul-workbench.md,
 * phase 4): the row's Review action opens Quick Review
 * on the card; Approve waits until every non-generated file is marked in the
 * file walk; Skip generated and V mark them; Approve submits, flings the card
 * right and the next one rises.
 *
 * The seeded user is `test-user` (the happy-path `check_github_auth`).
 */

const ME = 'test-user';
const NOW = Date.parse('2026-05-08T10:00:00Z'); // the frozen e2e clock
const HOUR = 60 * 60 * 1000;

const PATHS = [
  'src/services/review.ts',
  'src/components/pr/Row.tsx',
  'README.md',
  'bun.lock',
  'src/generated/changelog.ts',
];

function makePr(number: number, author: string, requestedReviewers: string[] = []): unknown {
  return {
    pullRequest: {
      number,
      title: `Quick review change ${number}`,
      headRef: `feature/${number}`,
      headSha: `sha${number}`,
      baseRef: 'master',
      authorLogin: author,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(NOW - 48 * HOUR).toISOString(),
      updatedAt: new Date(NOW - number * HOUR).toISOString(),
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/test-org/borgdock/pull/${number}`,
      body: `Change ${number}, with every file listed.`,
      repoOwner: 'test-org',
      repoName: 'borgdock',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 40,
      deletions: 4,
      changedFiles: PATHS.length,
      commitCount: 2,
      requestedReviewers,
    },
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 12,
    skippedCount: 0,
    totalCheckCount: 12,
  };
}

/** Two reviews requested from me, one PR of mine, one of someone else. */
const PRS = [
  makePr(3, 'mira', [ME]),
  makePr(4, 'jules', [ME]),
  makePr(1, ME),
  makePr(2, 'sasha'),
];

/** Answers GitHub for PRs 3 and 4 and records the reviews posted. */
async function routeGitHub(page: Page) {
  const reviews: { number: number; body: unknown }[] = [];
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/pulls\/(3|4)(\/|\?|$)/, (route) => {
    const url = route.request().url();
    const number = Number(/pulls\/(\d+)/.exec(url)?.[1]);
    if (route.request().method() === 'POST') {
      reviews.push({ number, body: route.request().postDataJSON() });
      return route.fulfill({ status: 200, json: { id: number } });
    }
    if (url.includes('/files'))
      return route.fulfill({
        json: PATHS.map((filename, i) => ({
          filename,
          sha: `blob${number}-${i}`,
          status: 'modified',
          additions: 8,
          deletions: 1,
          patch: `@@ -1,2 +1,3 @@\n const a = ${i};\n-const b = 1;\n+const b = 2;\n+const c = 3;`,
        })),
      });
    if (/\/(reviews|comments)(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        number,
        title: `Quick review change ${number}`,
        head: { sha: `sha${number}`, ref: `feature/${number}` },
        base: { sha: 'base', ref: 'master' },
        user: { login: number === 3 ? 'mira' : 'jules' },
        state: 'open',
        html_url: `https://github.com/test-org/borgdock/pull/${number}`,
        body: `Change ${number}, with every file listed.`,
        changed_files: PATHS.length,
        additions: 40,
        deletions: 4,
        commits: 2,
        labels: [],
      },
    });
  });
  return reviews;
}

async function bootList(page: Page) {
  await bootApp(page, '', 'happy-path');
  const reviews = await routeGitHub(page);
  await seedMainWindow(page, { prs: PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-list .bd-wb-row')).toHaveCount(PRS.length);
  return reviews;
}

/** Walks every file: Skip generated, then V for each file left. */
async function reviewAllFiles(page: Page) {
  await page.getByRole('button', { name: 'Review files' }).click();
  await expect(page.getByText('0 of 5 reviewed, 3 to go')).toBeVisible();
  const skip = page.getByRole('button', { name: 'Skip generated' });
  await skip.click();
  await expect(skip).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.keyboard.press('v');
  await expect(page.getByText('5 of 5 reviewed, 0 to go')).toBeVisible();
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByRole('navigation', { name: 'Review path' })).toHaveCount(0);
}

test('the row Review action opens Quick Review; Approve waits for the files', async ({ page }) => {
  const reviews = await bootList(page);

  // Only review and merge shapes get the slot: my PR and someone else's do not.
  await expect(page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#1"] .bd-row-action')).toHaveCount(0);
  await expect(page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#2"] .bd-row-action')).toHaveCount(0);

  const row = page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#3"]');
  const box = await row.locator('.bd-wb-row__num').boundingBox();
  await row.hover();
  // The slot sits beside the row (not inside its role="button"), in the wrapper.
  const review = page
    .locator('.bd-wb-rowwrap[data-key="test-org/borgdock#3"]')
    .getByRole('button', { name: 'Review #3' });
  await expect(review).toBeVisible();
  // The slot draws over the row: the columns did not move.
  expect(await row.locator('.bd-wb-row__num').boundingBox()).toEqual(box);
  await page.screenshot({ path: test.info().outputPath('row-review-slot.png') });
  await review.click();

  const dialog = page.getByRole('dialog', { name: 'Quick Review' });
  await expect(dialog).toBeVisible();
  // The row's action opened Quick Review, not the detail view.
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(dialog.getByRole('article', { name: 'Pull request #3' })).toBeVisible();
  await expect(dialog.getByText('3 of 3 to review, 2 generated')).toBeVisible();
  const approve = dialog.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeDisabled();
  // Blocked, not disabled: Approve stays reachable and says why.
  await expect(approve).toHaveAttribute('aria-disabled', 'true');
  await expect(approve).toHaveAccessibleDescription('3 files not reviewed yet');
  await expect(dialog.locator('.qr-act-note')).toHaveText('3 files not reviewed yet');
  await page.screenshot({ path: test.info().outputPath('card-approve-disabled.png') });

  await reviewAllFiles(page);
  await expect(dialog.getByRole('button', { name: 'Review files again' })).toBeVisible();
  await expect(approve).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('card-approve-enabled.png') });
  await approve.click();

  await expect(dialog.getByText('Review Complete', { exact: true })).toBeVisible();
  expect(reviews).toEqual([
    { number: 3, body: { event: 'APPROVE', body: '', commit_id: 'sha3', comments: [] } },
  ]);
});

test('approving the top card of a queue flings it right and the next card rises', async ({
  page,
}) => {
  const reviews = await bootList(page);
  // Shift+R: every review waiting on me.
  await page.keyboard.press('Shift+R');
  const dialog = page.getByRole('dialog', { name: 'Quick Review' });
  await expect(dialog.getByText('PR 1 / 2')).toBeVisible();
  const top = dialog.locator('.qr-card[data-i="0"]');
  const first = Number((await top.getAttribute('aria-label'))?.replace(/\D+/g, ''));
  const second = first === 3 ? 4 : 3;
  // The next PR peeks behind the top card.
  await expect(dialog.locator('.qr-card[data-i="1"]')).toContainText(`#${second}`);

  await reviewAllFiles(page);
  await page.keyboard.press('ArrowRight');

  await expect(dialog.locator('.qr-card--gone-right')).toContainText(`#${first}`);
  await expect(dialog.getByText('PR 2 / 2')).toBeVisible();
  await expect(dialog.getByRole('article', { name: `Pull request #${second}` })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(dialog.locator('.qr-card--gone-right')).toHaveCount(0);
  expect(reviews.map((r) => r.number)).toEqual([first]);

  // Review later flings the last card left and ends on the summary.
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('Review Complete', { exact: true })).toBeVisible();
});
