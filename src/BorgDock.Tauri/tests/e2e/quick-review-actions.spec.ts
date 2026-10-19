import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootApp, seedMainWindow } from './helpers/test-utils';
import type { PullRequestWithChecks } from '../../src/types';

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
async function routeGitHub(page: Page, patch?: string) {
  const reviews: { number: number; body: unknown }[] = [];
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/commits\/[^/]+\/check-runs/, (route) => route.fulfill({ json: { check_runs: [], total_count: 0 } }));
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
          patch: patch ?? `@@ -1,2 +1,3 @@\n const a = ${i};\n-const b = 1;\n+const b = 2;\n+const c = 3;`,
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

async function bootList(page: Page, patch?: string) {
  await bootApp(page, '', 'happy-path');
  const reviews = await routeGitHub(page, patch);
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
  await page.getByRole('button', { name: /^(Review files|Continue reviewing · \d+ left)$/ }).click();
  await expect(page.getByText('0 of 5 reviewed, 3 to go')).toBeVisible();
  const skip = page.getByRole('button', { name: 'Skip generated' });
  await skip.click();
  await expect(skip).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.keyboard.press('v');
  await expect(page.getByText('5 of 5 reviewed, 0 to go')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('walk-finish-shortcut.png') });
  await page.keyboard.press('f');
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

  await page.keyboard.press('Enter');
  const diff = dialog.locator('[data-quick-review-content]');
  await dialog.locator('.qr-diff').evaluate((element) => {
    (element as HTMLElement).style.minHeight = '1800px';
  });
  await page.keyboard.press('j');
  await expect.poll(() => diff.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('k');
  await expect.poll(() => diff.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(dialog.getByText('File 1 of 5')).toBeVisible();
  await page.keyboard.press('n');
  await expect(dialog.getByText('File 2 of 5')).toBeVisible();
  await page.keyboard.press('p');
  await expect(dialog.getByText('File 1 of 5')).toBeVisible();
  await page.keyboard.press('f');

  await reviewAllFiles(page);
  await expect(dialog.getByRole('button', { name: 'Review files again' })).toBeVisible();
  await expect(approve).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('card-approve-enabled.png') });
  await page.keyboard.press('w');
  await expect(dialog.getByRole('heading', { name: 'Your review' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('a');

  await expect(dialog.getByText('Review Complete', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Next review' })).toContainText('Quick review change 4');
  await page.screenshot({ path: test.info().outputPath('review-complete-next-pr.png') });
  await expect(dialog.getByRole('button', { name: 'Review next PR' })).toHaveAttribute('aria-keyshortcuts', 'Enter');
  await dialog.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('article', { name: 'Pull request #4' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Review later' }).click();
  await expect(dialog.getByRole('button', { name: 'Review next PR' })).toHaveCount(0);
  await dialog.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('Review Complete', { exact: true })).toBeVisible();
  expect(reviews).toEqual([
    { number: 3, body: { event: 'APPROVE', body: '', commit_id: 'sha3', comments: [] } },
  ]);
});

test('full screen preserves the file walk and remembers the size across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await bootList(page);
  const openReview = async () => {
    const row = page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#3"]');
    await row.hover();
    await row.getByRole('button', { name: 'Review #3' }).click();
  };
  await openReview();
  const dialog = page.getByRole('dialog', { name: 'Quick Review' });
  const normalBounds = await dialog.boundingBox();
  expect(normalBounds?.width).toBe(1440);
  const expand = dialog.getByRole('button', { name: 'Full screen', exact: true });
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('article', { name: 'Pull request #3' })).toBeVisible();
  const fullBounds = { x: 0, y: 0, width: 1920, height: 1080 };
  await expect.poll(() => dialog.boundingBox()).toEqual(fullBounds);
  await expect(dialog.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Review files', exact: true }).click();
  await dialog.focus();
  await page.keyboard.press('v');
  await expect(dialog.getByText('File 2 of 5')).toBeVisible();
  const currentPath = await dialog.locator('.qr-file[aria-current]').getAttribute('title');
  await dialog.getByRole('button', { name: 'Exit full screen' }).click();
  await expect.poll(() => dialog.boundingBox()).toEqual(normalBounds);
  await expect(dialog.locator('.qr-file[aria-current]')).toHaveAttribute('title', currentPath!);
  await expect(dialog.getByText('1 of 5 reviewed, 2 to go')).toBeVisible();
  await dialog.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect.poll(() => dialog.boundingBox()).toEqual(fullBounds);
  await page.screenshot({ path: test.info().outputPath('quick-review-fullscreen.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await bootList(page);
  await openReview();
  await expect.poll(() => dialog.boundingBox()).toEqual(fullBounds);
  await dialog.getByRole('button', { name: 'Review later' }).click();
  await expect(dialog.getByText('Review Complete', { exact: true })).toBeVisible();
  await expect.poll(() => dialog.boundingBox()).toEqual(fullBounds);
  await dialog.getByRole('button', { name: 'Exit full screen' }).click();
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(760);
});

test('long diff lines scroll with H/L and wrap without changing review or draft state', async ({ page }) => {
  const longLine = `    const exportNames = '${'abcdefghijklmnopqrstuvwxyz'.repeat(45)}';`;
  const patch = `@@ -1 +1 @@\n-old();\n+${longLine}`;
  await bootList(page, patch);
  const row = page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#3"]');
  await row.hover();
  await row.getByRole('button', { name: 'Review #3' }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick Review' });
  await dialog.getByRole('button', { name: 'Review files', exact: true }).click();
  const scroller = dialog.locator('[data-diff-scroll]');
  const line = dialog.locator('[data-line-kind="add"] [data-diff-code]').first();
  const originalText = await line.textContent();
  const originalHeight = (await line.boundingBox())!.height;
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await dialog.focus();
  await page.keyboard.press('l');
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press('H');
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(dialog.locator('.qr-shortcuts')).toContainText('H/L scroll horizontally');
  await expect(dialog.locator('.qr-shortcuts')).toContainText('W wrap lines');
  await page.screenshot({ path: test.info().outputPath('quick-review-long-line.png') });
  await page.keyboard.press('w');
  const wrap = dialog.getByRole('button', { name: 'Wrap lines', exact: true });
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect.poll(async () => (await line.boundingBox())!.height).toBeGreaterThan(originalHeight);
  expect(await line.textContent()).toBe(originalText);
  await expect(dialog.getByText('File 1 of 5')).toBeVisible();
  await expect(dialog.getByText('0 of 5 reviewed, 3 to go')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('quick-review-wrap-lines.png') });
  await dialog.getByRole('button', { name: 'Comment on new line 1' }).click();
  const draft = dialog.getByPlaceholder('Describe the issue or suggest a change...');
  await draft.fill('Please check this long export.');
  await page.keyboard.type('hlw');
  await expect(draft).toHaveValue('Please check this long export.hlw');
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await wrap.click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'false');
  await expect(draft).toHaveValue('Please check this long export.hlw');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await wrap.click();
  await dialog.focus();
  await page.keyboard.press('n');
  await expect(dialog.getByText('File 2 of 5')).toBeVisible();
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await bootList(page, patch);
  await row.hover();
  await row.getByRole('button', { name: 'Review #3' }).click();
  await dialog.getByRole('button', { name: /^(Review files|Continue reviewing)/ }).click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Comments', exact: true }).click();
  await expect(wrap).toBeDisabled();
  await dialog.focus();
  await page.keyboard.press('w');
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Back to diff', exact: true }).click();
});

test('rich image diffs show exact revisions, file lifecycle changes, and SVG text fallback', async ({ page }) => {
  await bootList(page);
  const before = readFileSync('../../docs/whats-new/4.0.0/dispatch.png');
  const after = readFileSync('../../docs/whats-new/4.0.1/dispatch-width.png');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="30" fill="purple"/></svg>');
  const changes = [
    { filename: 'images/change.png', status: 'modified', sha: 'new-png' },
    { filename: 'images/new.png', status: 'added', sha: 'new-png' },
    { filename: 'images/removed.png', status: 'removed', sha: 'old-png' },
    { filename: 'images/renamed.png', status: 'renamed', previous_filename: 'images/previous name.png', sha: 'new-png' },
    { filename: 'images/vector.svg', status: 'modified', sha: 'new-svg', patch: '@@ -1 +1 @@\n-<svg/>\n+<svg><circle/></svg>' },
  ].map((file) => ({ additions: 0, deletions: 0, ...file }));
  const originalRequests: string[] = [];
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/pulls\/3\/files/, (route) => route.fulfill({ json: changes }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/compare\//, (route) => {
    expect(route.request().url()).toContain('/compare/base...sha3');
    return route.fulfill({ json: { merge_base_commit: { sha: 'merge-base' } } });
  });
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/contents\//, (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('ref')).toBe('merge-base');
    expect(route.request().headers().accept).toBe('application/vnd.github.object+json');
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    originalRequests.push(decodeURIComponent(url.pathname));
    const bytes = url.pathname.endsWith('.svg') ? svg : before;
    return route.fulfill({ json: { type: 'file', sha: 'old-png', encoding: 'base64', content: bytes.toString('base64'), size: bytes.length } });
  });
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/git\/blobs\//, (route) => {
    const bytes = route.request().url().endsWith('/new-svg') ? svg : after;
    return route.fulfill({ json: { sha: 'new-png', encoding: 'base64', content: bytes.toString('base64'), size: bytes.length } });
  });
  const row = page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#3"]');
  await row.hover();
  await row.getByRole('button', { name: 'Review #3' }).click();
  const review = page.getByRole('dialog', { name: 'Quick Review' });
  await review.getByRole('button', { name: 'Review files', exact: true }).click();
  const comparison = review.getByRole('region', { name: 'Image comparison' });
  await expect(comparison.getByAltText('Before: images/change.png')).toBeVisible();
  await expect(comparison.getByAltText('After: images/change.png')).toBeVisible();
  await expect.poll(() => comparison.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(review.getByRole('button', { name: 'Wrap lines' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('quick-review-rich-image-diff.png') });
  await comparison.getByRole('button', { name: 'View before image' }).click();
  const viewer = page.getByRole('dialog', { name: 'Image diff 1 of 2 · Before: images/change.png', exact: true });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByText('125%')).toBeVisible();
  await page.keyboard.press('Escape');
  await review.focus();
  await page.keyboard.press('v');
  await expect(review.getByText('1 of 5 reviewed, 4 to go')).toBeVisible();
  await expect(comparison.getByText('New image', { exact: true })).toBeVisible();
  await expect(comparison.getByAltText('After: images/new.png')).toBeVisible();
  await review.locator('.qr-file[title="images/removed.png"]').click();
  await expect(comparison.getByText('Image removed', { exact: true })).toBeVisible();
  await expect(comparison.getByAltText('Before: images/removed.png')).toBeVisible();
  await review.locator('.qr-file[title="images/renamed.png"]').click();
  await expect(comparison.getByAltText('Before: images/previous name.png')).toBeVisible();
  await expect(comparison.getByAltText('After: images/renamed.png')).toBeVisible();
  expect(originalRequests).toContain('/repos/test-org/borgdock/contents/images/previous name.png');
  await review.locator('.qr-file[title="images/vector.svg"]').click();
  await expect(comparison.getByAltText('After: images/vector.svg')).toBeVisible();
  await review.getByRole('button', { name: 'Rich diff', exact: true }).click();
  await expect(comparison).toHaveCount(0);
  await expect(review.locator('[data-diff-code]').filter({ hasText: '<svg><circle/></svg>' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Comment on new line 1' })).toBeVisible();
  await review.getByRole('button', { name: 'Rich diff', exact: true }).click();
  await expect(comparison.getByAltText('After: images/vector.svg')).toBeVisible();
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
  await expect(dialog.getByRole('button', { name: 'Review next PR' })).toHaveCount(0);
});

test('overview shows description screenshots, required-check gaps and a read-only ADO popup', async ({ page }) => {
  await bootList(page);
  const head = 'a1b2c3d4e5f67890123456789012345678901234';
  const proofPr = structuredClone(PRS[0]) as PullRequestWithChecks;
  Object.assign(proofPr.pullRequest, { headSha: head, title: 'Questionnaire replacement (AB#59671)', baseRef: 'fix/parent', body: '## Summary\n\nRefuse the add before committing.\n\nStacked on #4525.\n\n## Changes\n\nRegression coverage.' });
  await seedMainWindow(page, { prs: [proofPr], settings: { azureDevOps: { organization: 'test-org', project: 'test-project', authMethod: 'pat', personalAccessToken: 'test-pat' } } });
  await page.evaluate(() => {
    const item = { id: 59671, rev: 1, url: '', htmlUrl: 'https://dev.azure.com/test-org/_workitems/edit/59671', relations: [], fields: {
      'System.Title': 'Refuse questionnaire replacement', 'System.State': 'Active', 'System.WorkItemType': 'Bug', 'System.AssignedTo': 'Vera',
      'System.Description': '<p>The questionnaire must remain on the live activity.</p>',
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>Roll back the transaction before showing the translated warning.</p>',
    } };
    const mock = (window as unknown as { __mockTauri: { addHandler: (command: string, handler: (args: Record<string, unknown>) => unknown) => void } }).__mockTauri;
    mock.addHandler('ado_fetch', (args) => {
      const request = args.request as { url: string };
      const body = /workitems\/59671(?:\?|$)/i.test(request.url) ? item : /workitems\?ids=/i.test(request.url) ? { value: [item] } : { value: [], comments: [] };
      return { status: 200, status_text: 'OK', body: JSON.stringify(body), body_base64: null, headers: { 'content-type': 'application/json' } };
    });
  });
  const image = new URL('/whats-new/3.0.0/quick-review.png', page.url()).href;
  const secondImage = new URL('/whats-new/1.0.11/close-pr.png', page.url()).href;
  proofPr.pullRequest.body += `\n\n## Verification\n\n![First](${image})\n\n<img alt="Second" src="${secondImage}">`;
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/pulls\/3(?:\?|$)/, (route) => route.fulfill({ json: {
    number: 3, title: proofPr.pullRequest.title, head: { sha: head, ref: 'fix/questionnaire' }, base: { sha: 'base', ref: 'fix/parent' },
    user: { login: 'mira' }, state: 'open', html_url: proofPr.pullRequest.htmlUrl, body: proofPr.pullRequest.body, changed_files: PATHS.length,
    additions: 40, deletions: 4, commits: 2, labels: [], mergeable: false,
  } }));
  await page.route(image, (route) => route.fulfill({ contentType: 'image/png', body: readFileSync('../../docs/whats-new/3.0.0/quick-review.png') }));
  await page.route(secondImage, (route) => route.fulfill({ contentType: 'image/png', body: readFileSync('../../docs/whats-new/1.0.11/close-pr.png') }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/issues\/3\/comments/, (route) => route.fulfill({ json: [{
    id: 77, user: { login: 'vera_gomocha' }, created_at: new Date(NOW - HOUR).toISOString(), html_url: `${proofPr.pullRequest.htmlUrl}#issuecomment-77`,
    body: `<!-- vera proof: {"head_sha":"${head}"} -->`,
    body_html: `<h2>PROOF</h2><p>Vera CLI: browser verification passed.</p><img alt="First" src="${image}"><img alt="Second" src="${secondImage}">`,
  }] }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/rules\/branches\//, (route) => route.fulfill({ json: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'Backend build / test' }] } }] }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/branches\/.*\/protection\/required_status_checks/, (route) => route.fulfill({ json: { contexts: [] } }));
  await page.locator('.bd-wb-row[data-pr-key="test-org/borgdock#3"]').hover();
  await page.locator('.bd-wb-rowwrap[data-key="test-org/borgdock#3"]').getByRole('button', { name: 'Review #3' }).click();
  const review = page.getByRole('dialog', { name: 'Quick Review' });
  await expect(review.getByText('1 required check needs attention')).toBeVisible();
  await expect(review.getByText('Targets fix/parent')).toBeVisible();
  await expect(review.getByRole('region', { name: 'Developer proof' })).toHaveCount(0);
  const description = review.getByRole('region', { name: 'PR description' });
  await expect(description.getByRole('heading', { name: 'Verification' })).toBeVisible();
  await expect(description.locator('img')).toHaveCount(2);
  await description.getByAltText('Second').scrollIntoViewIfNeeded();
  await expect.poll(() => description.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await description.getByAltText('First').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('overview-description-light.png') });
  await review.getByRole('button', { name: /Read AB#59671/ }).hover();
  await expect(page.getByRole('tooltip')).toContainText('The questionnaire must remain on the live activity.');
  await review.getByRole('button', { name: /Read AB#59671/ }).click();
  const workItem = page.getByRole('dialog', { name: 'AB#59671', exact: true });
  await expect(workItem.getByText('Read-only preview')).toBeVisible();
  await expect(workItem.getByText('The questionnaire must remain on the live activity.')).toBeVisible();
  await expect(workItem.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('ado-popup.png') });
  await page.keyboard.press('Escape');
  await expect(workItem).toHaveCount(0);
  await expect(review).toBeVisible();
  await expect(review.getByText('0/3 reviewed', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /All comments/ }).click();
  const comment = page.getByRole('dialog', { name: 'PR comments', exact: true });
  await expect(comment).toContainText('Vera CLI: browser verification passed.');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('pr-comments.png') });
  await page.keyboard.press('Escape');
  await page.mouse.move(1400, 20);
  await seedMainWindow(page, { settings: { ui: { theme: 'dark' } } });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.screenshot({ path: test.info().outputPath('overview-description-dark.png') });
  await page.setViewportSize({ width: 560, height: 900 });
  await expect(review.getByRole('button', { name: 'Review files' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('overview-description-narrow.png') });
  await review.getByRole('heading', { name: 'Checks', exact: true }).scrollIntoViewIfNeeded();
  await expect(review.getByText('Backend build / test')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('overview-description-narrow-checks.png') });
});
