import { expect, type Page, test } from '@playwright/test';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Approving dependency updates without Quick Review
 * (design/dependency-approve/mockups.html): the strip above the list opens
 * the sheet with the safe updates picked, Approve waits for Undo, then each
 * PR is re-read and approved at the commit on screen, with auto-merge.
 *
 * The seeded user is `test-user` (the happy-path `check_github_auth`).
 */

const ME = 'test-user';
const NOW = Date.parse('2026-05-08T10:00:00Z'); // the frozen e2e clock
const HOUR = 60 * 60 * 1000;
/** Approvals wait 5 s for Undo before they are posted. */
const UNDO_WINDOW = { timeout: 12_000 };

function makePr(number: number, title: string, author = 'dependabot'): unknown {
  return {
    pullRequest: {
      number,
      title,
      headRef: `dependabot/npm_and_yarn/${number}`,
      headSha: `sha${number}`,
      baseRef: 'main',
      authorLogin: author,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: new Date(NOW - 48 * HOUR).toISOString(),
      updatedAt: new Date(NOW - number * HOUR).toISOString(),
      isDraft: false,
      mergeable: true,
      htmlUrl: `https://github.com/test-org/web/pull/${number}`,
      body: '',
      repoOwner: 'test-org',
      repoName: 'web',
      reviewStatus: 'none',
      commentCount: 0,
      labels: ['dependencies'],
      additions: 4,
      deletions: 4,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [ME],
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

const TITLES: Record<number, string> = {
  1: 'build(deps): bump lodash from 4.17.20 to 4.17.21',
  2: 'build(deps-dev): bump vitest from 3.1.1 to 3.2.0',
  3: 'build(deps): bump react-router from 6.30.0 to 7.6.1',
};

const PRS = [
  makePr(1, TITLES[1] as string),
  makePr(2, TITLES[2] as string),
  makePr(3, TITLES[3] as string),
  makePr(4, 'Planner: drag a visit onto another technician', 'mira'),
];

interface GitHubLog {
  reviews: { number: number; body: unknown }[];
  autoMerge: unknown[];
}

/** Answers GitHub for the bot PRs; `heads` overrides a PR's current head. */
async function routeGitHub(page: Page, heads: Record<number, string> = {}): Promise<GitHubLog> {
  const log: GitHubLog = { reviews: [], autoMerge: [] };
  await page.route(/api\.github\.com\/repos\/test-org\/web\/commits\/[^/]+\/check-runs/, (route) =>
    route.fulfill({ json: { check_runs: [], total_count: 0 } }),
  );
  await page.route(/api\.github\.com\/repos\/test-org\/web\/pulls\/\d+(\/reviews)?(\?|$)/, (route) => {
    const url = route.request().url();
    const number = Number(/pulls\/(\d+)/.exec(url)?.[1]);
    if (route.request().method() === 'POST') {
      log.reviews.push({ number, body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: number, user: { login: ME }, commit_id: `sha${number}` } });
    }
    // A refresh after the approval reads it back.
    if (url.includes('/reviews'))
      return route.fulfill({
        json: log.reviews
          .filter((r) => r.number === number)
          .map(() => ({
            user: { login: ME },
            state: 'APPROVED',
            commit_id: `sha${number}`,
            submitted_at: new Date(NOW).toISOString(),
          })),
      });
    return route.fulfill({
      json: {
        number,
        title: TITLES[number] ?? `PR ${number}`,
        user: { login: 'dependabot[bot]', avatar_url: '' },
        state: 'open',
        merged: false,
        draft: false,
        mergeable: true,
        head: { sha: heads[number] ?? `sha${number}`, ref: `dependabot/npm_and_yarn/${number}` },
        base: { sha: 'base', ref: 'main' },
        html_url: `https://github.com/test-org/web/pull/${number}`,
        body: '',
        labels: [],
        requested_reviewers: [],
        created_at: new Date(NOW - 48 * HOUR).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        changed_files: 2,
        additions: 4,
        deletions: 4,
        commits: 1,
      },
    });
  });
  await page.route('https://api.github.com/graphql', (route) => {
    const { query, variables } = route.request().postDataJSON();
    if (query.includes('AutoMergeTarget')) {
      const number = variables.number as number;
      return route.fulfill({
        json: {
          data: {
            repository: {
              pullRequest: {
                id: `PR_${number}`,
                headRefOid: `sha${number}`,
                mergeStateStatus: 'BLOCKED',
                state: 'OPEN',
                merged: false,
                autoMergeRequest: null,
              },
            },
          },
        },
      });
    }
    if (query.includes('ApproveAutoMerge')) {
      log.autoMerge.push(variables.input);
      return route.fulfill({
        json: {
          data: {
            enablePullRequestAutoMerge: {
              pullRequest: { merged: false, autoMergeRequest: { enabledAt: new Date(NOW).toISOString() } },
            },
          },
        },
      });
    }
    return route.fallback();
  });
  return log;
}

async function bootList(page: Page, heads?: Record<number, string>): Promise<GitHubLog> {
  await bootApp(page, '', 'happy-path');
  const log = await routeGitHub(page, heads);
  await seedMainWindow(page, { prs: PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  await expect(page.locator('.bd-wb-list .bd-wb-row')).toHaveCount(PRS.length);
  return log;
}

const approval = (number: number) => ({
  number,
  body: { event: 'APPROVE', commit_id: `sha${number}`, comments: [] },
});

test('the strip approves the safe updates in one go, with auto-merge', async ({ page }) => {
  test.slow();
  const log = await bootList(page);
  const strip = page.getByRole('region', { name: 'Dependency updates' });
  await expect(strip).toContainText('3 dependency updates');
  await expect(strip).toContainText('2 ready to approve · 1 major');
  await strip.getByRole('button', { name: 'Approve 2…' }).click();

  const sheet = page.getByRole('dialog', { name: 'Approve dependency updates' });
  await expect(sheet.getByRole('checkbox', { name: /^lodash/ })).toBeChecked();
  await expect(sheet.getByRole('checkbox', { name: /^vitest/ })).toBeChecked();
  await expect(sheet.getByRole('checkbox', { name: /^react-router/ })).not.toBeChecked();
  await expect(sheet.getByText('Major update: read its release notes first')).toBeVisible();
  await expect(sheet.getByText('Planner')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Approve 2' }).click();

  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Approving 2 dependency updates')).toBeVisible();
  // Nothing is posted while Undo is offered.
  expect(log.reviews).toEqual([]);
  await expect.poll(() => log.reviews, UNDO_WINDOW).toEqual([approval(1), approval(2)]);
  await expect
    .poll(() => log.autoMerge)
    .toEqual([
      { pullRequestId: 'PR_1', expectedHeadOid: 'sha1', mergeMethod: 'SQUASH' },
      { pullRequestId: 'PR_2', expectedHeadOid: 'sha2', mergeMethod: 'SQUASH' },
    ]);
  await expect(page.getByText('Approved 2 dependency updates')).toBeVisible();
  // Only the major update is left.
  await expect(strip).toContainText('1 dependency update');
});

test("a row's Approve can be undone, and skips a PR that moved", async ({ page }) => {
  test.slow();
  const log = await bootList(page, { 3: 'pushed-since' });

  const lodash = page.locator('.bd-wb-rowwrap[data-key="test-org/web#1"]');
  await lodash.hover();
  await lodash.getByRole('button', { name: 'Approve #1' }).click();
  await expect(page.getByText('Approving #1 · merges when green')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  // The row offers Approve again.
  await lodash.hover();
  await expect(lodash.getByRole('button', { name: 'Approve #1' })).toBeVisible();

  const router = page.locator('.bd-wb-rowwrap[data-key="test-org/web#3"]');
  await router.hover();
  await router.getByRole('button', { name: 'Approve #3' }).click();
  await expect(page.getByText('#3 not approved')).toBeVisible(UNDO_WINDOW);
  await expect(page.getByText('changed after you looked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open #3' })).toBeVisible();
  expect(log.reviews).toEqual([]);
  expect(log.autoMerge).toEqual([]);

  // The human's PR keeps Quick Review.
  const human = page.locator('.bd-wb-rowwrap[data-key="test-org/web#4"]');
  await human.hover();
  await expect(human.getByRole('button', { name: 'Review #4' })).toBeVisible();
});
