import { expect, test } from '@playwright/test';
import type { PullRequest } from '../../src/types';
import { getInvokeLog } from './helpers/mock-tauri';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

test('T3 checkout covers the app and keeps a long worktree list usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1253, height: 752 });
  const worktrees = Array.from({ length: 9 }, (_, index) => ({
    path: `/tmp/worktrees/.worktrees/worktree${index + 1}`,
    branchName: `feat/a-long-branch-name-for-worktree-${index + 1}`,
    isMainWorktree: false,
  }));
  await bootApp(page, '', 'happy-path', {
    list_worktrees_bare: worktrees,
    list_worktrees: worktrees,
    checkout_pr: () => {
      throw new Error('git fetch origin failed: timed out after 30s');
    },
  });
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
  const backdrop = page.getByRole('button', { name: 'Close T3 checkout dialog' });
  expect(await backdrop.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  expect(await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 16 && box.bottom <= innerHeight - 16 && el.scrollWidth <= el.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('checkout-fixed.png') });
  await page.setViewportSize({ width: 400, height: 600 });
  expect(await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 16 && box.bottom <= innerHeight - 16 && el.scrollWidth <= el.clientWidth;
  })).toBe(true);
  await dialog.locator('[data-worktree-row]').first().click();
  await dialog.locator('[data-checkout-action="check-out-here"]').click();
  await expect(dialog.getByText(/timed out after 30s/)).toBeVisible();
  expect((await getInvokeLog(page)).some((call) => call.cmd === 't3_open_thread')).toBe(false);
  await page.evaluate(() => {
    const mock = (window as unknown as {
      __mockTauri: { addHandler: (name: string, handler: () => unknown) => void };
    }).__mockTauri;
    mock.addHandler('checkout_pr', () => ({
      worktreePath: '/tmp/worktrees/.worktrees/worktree1',
      steps: [],
    }));
    mock.addHandler('t3_open_thread', () => ({ tier: 2, threadId: 'created-thread' }));
  });
  await dialog.locator('[data-checkout-action="retry"]').click();
  await dialog.locator('[data-checkout-action="check-out-here"]').click();
  await expect(dialog).toBeHidden();
  const launches = (await getInvokeLog(page)).filter((call) => call.cmd === 't3_open_thread');
  expect(launches).toHaveLength(1);
  expect(launches[0].args).toMatchObject({
    workspaceRoot: '/tmp/worktrees/.worktrees/worktree1',
    prNumber: 42,
  });
});
