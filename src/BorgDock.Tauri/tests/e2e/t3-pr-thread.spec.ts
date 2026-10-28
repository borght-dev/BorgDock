import { expect, type Page, test } from '@playwright/test';
import type { PullRequest } from '../../src/types';
import { getInvokeLog } from './helpers/mock-tauri';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

const PROJECT = {
  id: 'p-borgdock',
  title: 'borgdock',
  workspaceRoot: '/src/borgdock',
  repository: {
    key: 'github.com/test-org/borgdock',
    displayName: 'test-org/borgdock',
    owner: 'test-org',
    name: 'borgdock',
  },
};

/** The T3 on this machine answers with one project for the pull request's repository. */
async function seedT3(page: Page) {
  await page.evaluate(async (project) => {
    const path = '/src/stores/dispatch-store.ts';
    const { useDispatchStore } = await import(/* @vite-ignore */ path);
    useDispatchStore.setState({
      hosts: [{ id: 'local', label: 'This machine', ok: true, at: null, error: null }],
      projects: [{ ...project, hostId: 'local', hostLabel: 'This machine', available: true }],
      threads: [],
    });
  }, PROJECT);
}

test('Open in T3 asks where the thread runs and lets T3 check the branch out', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1253, height: 752 });
  await bootApp(page, '', 'happy-path', {
    t3_snapshot: { changed: true, sequence: 1, projects: [PROJECT], threads: [] },
    t3_open_pr_thread: 'created-thread',
  });
  await seedT3(page);
  await page.evaluate(
    async (pr) => {
      const path = '/src/services/t3-thread.ts';
      const { requestT3Thread } = await import(/* @vite-ignore */ path);
      await requestT3Thread(pr);
    },
    {
      ...(SAMPLE_PRS[0] as { pullRequest: PullRequest }).pullRequest,
      headRef: 'fix/58080-status-change-nameless-validation',
    },
  );

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /^This machine/ })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Project' })).toHaveText(/borgdock/);
  await expect(dialog.getByText(/checks out fix\/58080-status-change-nameless-validation/)).toBeVisible();
  const fits = () =>
    dialog.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.top >= 16 && box.bottom <= innerHeight - 16 && el.scrollWidth <= el.clientWidth;
    });
  expect(await fits()).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('open-in-t3.png') });
  await page.setViewportSize({ width: 400, height: 600 });
  expect(await fits()).toBe(true);

  await dialog.getByRole('button', { name: 'Open in T3' }).click();
  await expect(dialog).toBeHidden();
  const launches = (await getInvokeLog(page)).filter((call) => call.cmd === 't3_open_pr_thread');
  expect(launches).toHaveLength(1);
  expect(launches[0].args).toMatchObject({
    host: { id: 'local' },
    request: { projectId: 'p-borgdock', prNumber: 42, workspace: { type: 'checkOut' } },
  });
});
