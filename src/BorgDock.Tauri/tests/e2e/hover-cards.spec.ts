import { expect, type Page, test } from '@playwright/test';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Hover cards: the checks card on a PR row's check bar (why each check
 * failed, from the CI failure store) and the work item card on an AB#
 * reference in a PR description. Designs: design/check-hover/mockups.html
 * and design/work-item-hover/mockups.html.
 */

const PR = {
  pullRequest: {
    number: 77,
    title: 'Planboard: keep drag preview inside the resource lane',
    headRef: 'feature/77',
    headSha: 'a41f9c2d77e0',
    baseRef: 'master',
    authorLogin: 'test-user',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2026-05-08T08:00:00Z',
    updatedAt: '2026-05-08T09:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/test-org/borgdock/pull/77',
    body: '## Summary\n\nClamp the drag preview to the hovered lane.\n\nFixes AB#9100.',
    repoOwner: 'test-org',
    repoName: 'borgdock',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commitCount: 1,
    requestedReviewers: [],
  },
  overallStatus: 'red',
  failedCheckNames: ['unit'],
  failedCheckSuiteIds: [1],
  ciJobs: [
    { id: 501, kind: 'actions', name: 'unit', workflowName: 'CI', runId: 9, conclusion: 'failure' },
    { id: 502, kind: 'actions', name: 'lint', workflowName: 'CI', runId: 9, conclusion: 'success' },
    { id: 503, kind: 'actions', name: 'release', workflowName: 'CI', runId: 9, conclusion: 'skipped' },
  ],
  pendingCheckNames: ['e2e (chromium)'],
  passedCount: 1,
  skippedCount: 1,
  totalCheckCount: 4,
};

const FAILURES = {
  occurrences: [
    {
      occurrence: {
        id: 'occ-501',
        jobId: 501,
        jobName: 'unit',
        workflowName: 'CI',
        testedSha: 'a41f9c2d77e0',
        failedStep: 'Run vitest',
        startedAt: '2026-05-08T09:00:00Z',
        completedAt: '2026-05-08T09:04:12Z',
        evidenceState: 'ready',
        evidenceReason: null,
        htmlUrl: 'https://github.com/test-org/borgdock/actions/runs/9/job/501',
      },
      signals: [
        {
          occurrenceId: 'occ-501',
          ordinal: 0,
          tier: 'high',
          groupId: null,
          fingerprint: 'f',
          fingerprintVersion: 1,
          signal: {
            kind: 'test',
            parser: 'vitest',
            testId: 'PlanBoard › drag preview › clamps to the last lane',
            params: null,
            path: 'src/planboard/drag-preview.test.ts',
            line: 88,
            column: null,
            code: null,
            errorClass: 'AssertionError',
            expected: '380',
            actual: '412',
            message: 'expected 412 to be 380',
            excerpt: [],
            frames: [],
            repeats: 1,
          },
        },
      ],
      outcome: null,
    },
  ],
  groups: [],
};

/**
 * Answers the work item read for AB#9100. Serialized into the page by the
 * Tauri mock, so everything it uses is inside it.
 */
function adoFetch(args: Record<string, unknown>) {
  const request = args.request as { url?: string } | undefined;
  const asked = /ids=9100(?!\d)/.test(request?.url ?? '');
  const item = {
    id: 9100,
    rev: 3,
    url: 'https://dev.azure.com/test-org/_apis/wit/workItems/9100',
    htmlUrl: 'https://dev.azure.com/test-org/test-project/_workitems/edit/9100',
    relations: [],
    fields: {
      'System.Title': 'Drag preview lands one resource lane too low',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'test-user' },
      'System.IterationPath': 'test-project\\Sprint 22',
      'System.ChangedDate': '2026-05-08T08:00:00Z',
      'Microsoft.VSTS.Common.Priority': 2,
      'Microsoft.VSTS.TCM.ReproSteps': '<p>Scroll down and drag an order onto the last lane.</p>',
    },
  };
  return {
    status: 200,
    status_text: 'OK',
    body: JSON.stringify({ value: asked ? [item] : [] }),
    body_base64: null,
    headers: { 'content-type': 'application/json' },
  };
}

async function bootWithPr(page: Page) {
  await bootApp(page, '', 'happy-path', { ci_load_pr: FAILURES, ado_fetch: adoFetch });
  await seedMainWindow(page, { prs: [PR] });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
}

test('the check bar shows which checks failed and why', async ({ page }, testInfo) => {
  await bootWithPr(page);
  const row = page.locator('.bd-wb-list .bd-wb-row[data-pr-number="77"]');
  await row.locator('[data-checks-trigger]').hover();

  const card = page.locator('[data-checks-card="77"]');
  await expect(card).toBeVisible();
  const failing = card.locator('[data-check-failing="unit"]');
  await expect(failing).toContainText('Step Run vitest');
  await expect(failing).toContainText('4m 12s');
  await expect(failing).toContainText('PlanBoard › drag preview › clamps to the last lane');
  await expect(failing).toContainText('AssertionError: expected 412 to be 380');
  await expect(failing).toContainText('src/planboard/drag-preview.test.ts:88');
  await expect(card.getByRole('region', { name: 'Running checks' })).toContainText(
    'e2e (chromium)',
  );
  await expect(card.getByRole('region', { name: 'Passed checks' })).toContainText('lint');
  await expect(card.getByRole('region', { name: 'Skipped checks' })).toContainText('release');
  await expect(card.getByRole('button', { name: /Rerun failed/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('checks-card.png') });

  // A click on the bar opens the PR on its Checks tab, not its Overview.
  await row.locator('[data-checks-trigger]').click();
  // The first detail view compiles its lazy chunk in dev, hence the longer wait.
  await expect(page.locator('.bd-detail').getByRole('tab', { name: /^Checks/ })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 20_000 },
  );
});

test('an AB# reference in the description shows the work item', async ({ page }, testInfo) => {
  await bootWithPr(page);
  await page.locator('.bd-wb-list .bd-wb-row[data-pr-number="77"] .bd-wb-row__title').click();

  const description = page.getByRole('region', { name: 'PR description' });
  const ref = description.locator('[data-work-item-ref="9100"]');
  await expect(ref).toHaveText('AB#9100');
  await ref.hover();

  const card = page.locator('[data-work-item-card="9100"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('Drag preview lands one resource lane too low');
  await expect(card).toContainText('Active');
  await expect(card).toContainText('Sprint 22');
  await expect(card).toContainText('Scroll down and drag an order onto the last lane.');
  await page.screenshot({ path: testInfo.outputPath('work-item-card.png') });
});
