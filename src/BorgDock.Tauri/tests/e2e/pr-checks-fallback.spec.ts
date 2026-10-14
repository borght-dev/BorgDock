import { expect, test } from '@playwright/test';
import { bootApp, seedMainWindow } from './helpers/test-utils';

test('REST fallback shows current-head checks and distinguishes unavailable from empty', async ({ page }) => {
  await bootApp(page);
  const numbers = [4743, 4644, 4526, 4513];
  const titles = ['Reservation re-send', 'Retire combined schedule endpoint', 'Refresh mobile registration', 'Check skipped sections'];
  const prs = numbers.map((number, index) => ({
    number, title: titles[index], state: 'open', draft: false,
    html_url: `https://github.com/test-org/borgdock/pull/${number}`,
    user: { login: 'sasha', avatar_url: '' },
    head: { ref: `feature/${number}`, sha: `sha${number}` }, base: { ref: 'master', sha: 'main' },
    created_at: '2026-05-08T09:00:00Z', updated_at: '2026-05-08T09:30:00Z',
    labels: [], requested_reviewers: [{ login: 'test-user' }], comments: 0, review_comments: 0,
  }));
  await page.route('https://api.github.com/graphql', route => route.fulfill({ status: 200, json: { errors: [{ message: 'GraphQL unavailable' }] } }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/pulls\?state=open/, route => route.fulfill({ json: prs }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/commits\/.+\/status\?/, route => route.fulfill({ json: { total_count: 0, statuses: [] } }));
  await page.route(/api\.github\.com\/repos\/test-org\/borgdock\/commits\/.+\/check-runs\?/, route => {
    const number = numbers.find(n => route.request().url().includes(`sha${n}/`));
    if (number === 4526) return route.fulfill({ status: 503, body: 'Checks unavailable' });
    const checks = number === 4513 ? [] : [{ id: number, name: 'test', status: number === 4644 ? 'in_progress' : 'completed', conclusion: number === 4743 ? 'failure' : null, html_url: '', check_suite: { id: 1 } }];
    return route.fulfill({ json: { total_count: checks.length, check_runs: checks } });
  });
  await seedMainWindow(page, { prs: [] });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: /^Pull requests/ }).click();
  const row = (number: number) => page.locator(`.bd-wb-list [data-pr-number="${number}"] .bd-checkbar`);
  await expect(row(4743)).toHaveText('1 failing', { timeout: 15_000 });
  await expect(row(4644)).toHaveText('0 of 1, running');
  await expect(row(4526)).toHaveText('Checks unavailable');
  await expect(row(4513)).toHaveText('No checks');
  await page.screenshot({ path: 'test-results/pr-checks-fallback.png', fullPage: true });
});
