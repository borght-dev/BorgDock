import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { PullRequestWithChecks } from '../../src/types';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

const paths = [
  'src/orders/handler.ts',
  'src/orders/request.ts',
  'docs/orders.md',
  'Orders.Tests/Handler.cs',
  'src/orders/handler.test.ts',
];
const pr = {
  ...(SAMPLE_PRS[0] as PullRequestWithChecks),
  pullRequest: {
    ...(SAMPLE_PRS[0] as PullRequestWithChecks).pullRequest,
    changedFiles: paths.length,
  },
};
const longPatch =
  '@@ -0,0 +1,120 @@\n' +
  Array.from({ length: 120 }, (_, i) => `+const value${i} = ${i};`).join('\n');
const detail = {
  number: 42,
  title: pr.pullRequest.title,
  head: { sha: 'sha42', ref: 'feature/42' },
  base: { sha: 'base', ref: 'master' },
  user: { login: 'author' },
  state: 'open',
  html_url: pr.pullRequest.htmlUrl,
  body:
    '# Complete description\n\n' +
    Array.from(
      { length: 35 },
      (_, i) => `Paragraph ${i + 1}. All description content is available.`,
    ).join('\n\n'),
  changed_files: paths.length,
  additions: 124,
  deletions: 0,
  commits: 1,
  labels: [],
};
async function openReview(page: Page) {
  await page.evaluate(async (value) => {
    const path = '/src/stores/quick-review-store.ts';
    const { useQuickReviewStore } = await import(path);
    useQuickReviewStore.getState().startSinglePr(value);
  }, pr);
  await expect(page.locator('.qr-next')).toBeEnabled();
}
async function setup(page: Page) {
  await bootApp(page);
  const reviews: unknown[] = [];
  await page.route('https://api.github.com/repos/test-org/borgdock/pulls/42**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      reviews.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: { id: 1 } });
    }
    if (url.includes('/files?'))
      return route.fulfill({
        json: paths.map((filename, i) => ({
          filename,
          sha: `blob${i}`,
          status: 'added',
          additions: i === 0 ? 120 : 1,
          deletions: 0,
          patch: i === 0 ? longPatch : '@@ -0,0 +1 @@\n+const value = 1;',
        })),
      });
    return route.fulfill({ json: url.endsWith('/reviews') ? [] : detail });
  });
  await openReview(page);
  return reviews;
}

test('compact next button stays fixed across descriptions, diffs, comments, and widths', async ({
  page,
}) => {
  await setup(page);
  const initial = await page.locator('.qr-next').boundingBox();
  expect(initial?.height).toBe(28);
  await page.locator('[data-quick-review-content]').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByText('Paragraph 35.', { exact: false })).toBeVisible();
  await page.locator('.qr-next').click();
  expect(await page.locator('.qr-next').boundingBox()).toEqual(initial);
  expect(await page.locator('[data-quick-review-content]').evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Comment on new line 110', exact: true }).click();
  await page.getByPlaceholder('Describe the issue or suggest a change...').fill('Handle failure.');
  expect(await page.locator('.qr-next').boundingBox()).toEqual(initial);
  await page.getByRole('button', { name: 'Save draft' }).click();
  for (let i = 1; i < paths.length; i++) {
    await page.locator('.qr-next').click();
    expect(await page.locator('.qr-next').boundingBox()).toEqual(initial);
  }
  for (const width of [736, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const before = await page.locator('.qr-next').boundingBox();
    await page.locator('.qr-prev').click();
    await page.locator('.qr-next').click();
    expect(await page.locator('.qr-next').boundingBox()).toEqual(before);
  }
});

test('persists drafts through reload and submits the whole review against the viewed SHA', async ({
  page,
}) => {
  const reviews = await setup(page);
  await page.locator('.qr-next').click();
  await page.getByRole('button', { name: 'Comment on new line 1', exact: true }).click();
  await page.getByPlaceholder('Describe the issue or suggest a change...').fill('Handle failure.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.reload();
  await openReview(page);
  await expect(page.getByText('Handle failure.', { exact: true })).toBeVisible();
  await page.locator('.qr-finish').click();
  await page.getByPlaceholder('Add overall feedback...').fill('Please fix the comment.');
  await page.locator('.qr-mark').click();
  await expect(page.getByText('Review Complete', { exact: true })).toBeVisible();
  expect(reviews).toEqual([
    {
      event: 'COMMENT',
      body: 'Please fix the comment.',
      commit_id: 'sha42',
      comments: [
        { path: 'src/orders/handler.ts', line: 1, side: 'RIGHT', body: 'Handle failure.' },
      ],
    },
  ]);
});

test('skims screenshot comments by author and returns to the same diff position', async ({
  page,
}) => {
  await setup(page);
  const proof = 'https://github.com/user-attachments/assets/review-proof';
  const resolvedProof =
    'https://private-user-images.githubusercontent.com/123/review-proof?jwt=fixture';
  await page.route(resolvedProof, (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: readFileSync('public/whats-new/1.0.11/close-pr.png'),
    }),
  );
  await page.route('https://api.github.com/repos/test-org/borgdock/issues/42/comments?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          user: { login: 'author' },
          body: `![Raw private attachment](${proof})`,
          body_html: `<h2>Browser evidence</h2><p><img src="${resolvedProof}" alt="Passing screenshot" /></p>`,
          created_at: '2026-09-09T12:00:00Z',
          html_url: `${pr.pullRequest.htmlUrl}#issuecomment-1`,
        },
        {
          id: 2,
          user: { login: 'agent[bot]' },
          body: 'Other commenter evidence',
          created_at: '2026-09-09T13:00:00Z',
          html_url: pr.pullRequest.htmlUrl,
        },
      ],
    }),
  );
  await page.route('https://api.github.com/repos/test-org/borgdock/pulls/42/comments?*', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('https://api.github.com/repos/test-org/borgdock/pulls/42/reviews?*', (route) =>
    route.fulfill({ json: [] }),
  );
  // Exercise the packaged app's image policy, which Vite does not inject in dev.
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const imagePolicy = config.app.security.csp
    .split(';')
    .find((directive: string) => directive.trim().startsWith('img-src'));
  await page.evaluate((policy) => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = policy;
    document.head.append(meta);
  }, imagePolicy);
  await page.locator('.qr-next').click();
  await page.locator('[data-quick-review-content]').evaluate((el) => {
    el.scrollTop = 600;
  });
  const scroll = await page.locator('[data-quick-review-content]').evaluate((el) => el.scrollTop);
  const nextPosition = await page.locator('.qr-next').boundingBox();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  const screenshot = page.getByAltText('Passing screenshot');
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('src', resolvedProof);
  await expect
    .poll(() =>
      screenshot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  expect(await page.locator('.qr-next').boundingBox()).toEqual(nextPosition);
  await page.screenshot({ path: test.info().outputPath('comments.png') });
  await page.getByRole('button', { name: 'PR author · 1' }).click();
  await expect(page.getByText('Browser evidence')).toBeVisible();
  await expect(page.getByText('Other commenter evidence')).toHaveCount(0);
  await page.getByRole('button', { name: 'Other commenters · 1' }).click();
  await expect(page.getByText('Other commenter evidence')).toBeVisible();
  await expect(page.getByText('Browser evidence')).toHaveCount(0);
  await page.locator('.qr-next').click();
  expect(await page.locator('[data-quick-review-content]').evaluate((el) => el.scrollTop)).toBe(
    scroll,
  );
  await expect(page.getByText('File 1 of 5')).toBeVisible();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole('button', { name: 'Other commenters · 1' })).toBeVisible();
  await expect(page.locator('.qr-next')).toBeInViewport();
  expect(await page.locator('.qr-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('comments-mobile.png') });
});
