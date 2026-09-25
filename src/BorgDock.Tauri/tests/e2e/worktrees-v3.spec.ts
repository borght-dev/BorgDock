import { expect, type Page, test } from '@playwright/test';
import { getInvokeLog, type MockHandlers } from './helpers/mock-tauri';
import { SAMPLE_PRS, seedScenario } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * The Worktrees section of the main window (plans/ui-overhaul-workbench.md,
 * phase 5, decision 3) with `ui.layoutV3` on: the rail item opens a real
 * section with the worktree rows, selecting one shows its changes beside
 * the list, and a worktree whose branch has an open pull request opens it
 * in the detail view, with Back returning to Worktrees.
 *
 * The worktree commands are mocked the same way every spec mocks IPC: the
 * cache snapshot (`worktree_cache_get_all` / `worktree_cache_refresh`), the
 * status scan (`list_worktrees`) and the change set of a worktree
 * (`list_worktree_changes`). The happy-path repo `test-org/borgdock` has its
 * worktrees under /tmp/worktrees; worktree2 has PR #42's branch checked out.
 */

const BASE = '/tmp/worktrees';
const WT1 = `${BASE}/.worktrees/worktree1`;
const WT2 = `${BASE}/.worktrees/worktree2`;

const SNAPSHOT = [
  {
    repo: { owner: 'test-org', name: 'borgdock', basePath: BASE },
    entries: [
      { path: BASE, branchName: 'master', isMainWorktree: true },
      { path: WT1, branchName: 'fix/login', isMainWorktree: false },
      { path: WT2, branchName: 'feature/42', isMainWorktree: false },
    ],
    fetchedAt: 0,
  },
];

const STATUSES = [
  {
    path: BASE,
    branchName: 'master',
    isMainWorktree: true,
    status: 'clean',
    uncommittedCount: 0,
    ahead: 0,
    behind: 0,
    commitSha: 'a1',
  },
  {
    path: WT1,
    branchName: 'fix/login',
    isMainWorktree: false,
    status: 'dirty',
    uncommittedCount: 3,
    ahead: 0,
    behind: 0,
    commitSha: 'b2',
  },
  {
    path: WT2,
    branchName: 'feature/42',
    isMainWorktree: false,
    status: 'clean',
    uncommittedCount: 0,
    ahead: 1,
    behind: 0,
    commitSha: 'c3',
  },
];

const CHANGES = {
  vsHead: [
    {
      path: 'src/login.ts',
      previousPath: null,
      status: 'modified',
      additions: 4,
      deletions: 1,
      isBinary: false,
      isSubmodule: false,
    },
  ],
  vsBase: [],
  baseBranch: 'master',
  baseBranchSource: 'origin-head',
  detachedHead: false,
  mergeBaseUnavailable: false,
};

function worktreeHandlers(): MockHandlers {
  const happy = seedScenario('happy-path');
  const settings = happy.load_settings as { ui: Record<string, unknown> };
  return {
    load_settings: { ...settings, ui: { ...settings.ui, layoutV3: true } },
    worktree_cache_get_all: SNAPSHOT,
    worktree_cache_refresh: SNAPSHOT,
    list_worktrees: STATUSES,
    list_worktree_changes: CHANGES,
    open_tool_window: null,
  };
}

function railButton(page: Page, name: RegExp) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });
}

function worktreeRow(page: Page, path: string) {
  return page.locator(`[data-worktree-row][data-tree-path="${path}"]`);
}

async function openWorktrees(page: Page) {
  await bootApp(page, '', 'happy-path', worktreeHandlers());
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await railButton(page, /^Worktrees/).click();
  await expect(railButton(page, /^Worktrees/)).toHaveAttribute('aria-current', 'page');
}

test('the rail item opens the Worktrees section with its rows', async ({ page }) => {
  await openWorktrees(page);

  const section = page.locator('[data-worktrees-section]');
  await expect(section.getByRole('heading', { level: 1, name: 'Worktrees' })).toBeVisible();
  await expect(section.locator('[data-worktree-row]')).toHaveCount(3);
  await expect(worktreeRow(page, BASE)).toContainText('master');
  await expect(worktreeRow(page, WT1)).toContainText('fix/login');
  await expect(worktreeRow(page, WT1)).toContainText('3 changed');
  await expect(worktreeRow(page, WT2).locator('[data-worktree-pr="42"]')).toContainText('#42');

  // The tool window is still one click (and Ctrl+F7) away.
  await section.getByRole('button', { name: 'Open worktrees window' }).click();
  const log = await getInvokeLog(page);
  expect(
    log.some(
      (e) =>
        e.cmd === 'open_tool_window' && (e.args as { tool?: string }).tool === 'worktrees',
    ),
  ).toBe(true);
});

test('selecting a worktree shows its changes beside the list', async ({ page }) => {
  await openWorktrees(page);

  await worktreeRow(page, WT1).locator('[data-worktree-open]').click();

  const pane = page.getByRole('complementary', { name: 'Changes in fix/login' });
  await expect(pane).toBeVisible();
  await expect(worktreeRow(page, WT1)).toHaveAttribute('data-selected', 'true');
  await expect(pane.locator('[data-file-change="src/login.ts"]')).toBeVisible();
  const log = await getInvokeLog(page);
  expect(
    log.some(
      (e) =>
        e.cmd === 'list_worktree_changes' &&
        (e.args as { worktreePath?: string }).worktreePath === WT1,
    ),
  ).toBe(true);

  await page.keyboard.press('Escape');
  await expect(pane).toHaveCount(0);
});

test('J and Enter open changes from the keyboard', async ({ page }) => {
  await openWorktrees(page);
  await expect(page.locator('[data-worktree-row]')).toHaveCount(3);
  await page.locator('[data-worktrees-section] h1').click();

  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(worktreeRow(page, WT1)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Changes in fix/login' })).toBeVisible();
});

test('the linked pull request opens in the detail view and Back returns to Worktrees', async ({
  page,
}) => {
  await openWorktrees(page);

  await worktreeRow(page, WT2).locator('[data-worktree-pr="42"]').click();

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '2');
  await expect(page.getByRole('heading', { level: 1, name: 'Add cool feature' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(railButton(page, /^Worktrees/)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-worktree-row]')).toHaveCount(3);
});
