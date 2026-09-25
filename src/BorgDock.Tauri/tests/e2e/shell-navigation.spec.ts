import { expect, type Page, test } from '@playwright/test';
import { getInvokeLog, type MockHandlers } from './helpers/mock-tauri';
import { SAMPLE_PRS, seedScenario } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Workbench shell (plans/ui-overhaul-workbench.md, phase 1): the left rail
 * and the main window's view stack, with `ui.layoutV3` switched on through
 * the same `load_settings` mock every main-window spec uses.
 *
 * The plugin-store commands are backed by sessionStorage so a persisted
 * section survives `page.reload()` the way it survives an app restart
 * (sessionStorage outlives the reload; the init scripts that install the
 * mocks run again).
 */

function railHandlers(): MockHandlers {
  const happy = seedScenario('happy-path');
  const settings = happy.load_settings as { ui: Record<string, unknown> };
  return {
    load_settings: { ...settings, ui: { ...settings.ui, layoutV3: true } },
    'plugin:store|set': (args: Record<string, unknown>) => {
      sessionStorage.setItem(`e2e-store:${String(args.key)}`, JSON.stringify(args.value));
      return null;
    },
    'plugin:store|get': (args: Record<string, unknown>) => {
      const raw = sessionStorage.getItem(`e2e-store:${String(args.key)}`);
      return raw === null ? [null, false] : [JSON.parse(raw), true];
    },
  };
}

function railButton(page: Page, name: RegExp) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });
}

type PushView = (view: Record<string, unknown>) => void;

/** Pushes a view through the dev-only hook in src/test-support/test-seed.ts. */
function pushView(page: Page, view: Record<string, unknown>) {
  return page.evaluate((v) => {
    (window as unknown as { __borgdock_test_push_view: PushView }).__borgdock_test_push_view(v);
  }, view);
}

async function bootRail(page: Page) {
  await bootApp(page, '', 'happy-path', railHandlers());
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
}

test('the rail replaces the title-bar tabs', async ({ page }) => {
  await bootRail(page);
  await expect(page.getByRole('tab', { name: 'PRs' })).toHaveCount(0);
  for (const name of [/^Focus/, /^Pull requests/, /^Work items/, /^Worktrees/]) {
    await expect(railButton(page, name)).toBeVisible();
  }
});

test('switching section in the rail persists it across a restart', async ({ page }) => {
  await bootRail(page);

  await railButton(page, /^Pull requests/).click();
  await expect(railButton(page, /^Pull requests/)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-pr-row][data-pr-number="42"]')).toBeVisible();

  const log = await getInvokeLog(page);
  expect(
    log.some(
      (e) =>
        e.cmd === 'plugin:store|set' &&
        (e.args as { key?: string; value?: unknown }).key === 'activeSection' &&
        (e.args as { value?: unknown }).value === 'prs',
    ),
  ).toBe(true);

  await page.reload();
  await expect(railButton(page, /^Pull requests/)).toHaveAttribute('aria-current', 'page');
  await expect(railButton(page, /^Focus/)).not.toHaveAttribute('aria-current', 'page');
});

test('number keys switch sections', async ({ page }) => {
  await bootRail(page);
  await page.locator('body').click();

  await page.keyboard.press('4');
  await expect(railButton(page, /^Worktrees/)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Open worktrees window' })).toBeVisible();

  await page.keyboard.press('2');
  await expect(railButton(page, /^Pull requests/)).toHaveAttribute('aria-current', 'page');
});

test('Esc at depth 1 does nothing', async ({ page }) => {
  await bootRail(page);
  await railButton(page, /^Pull requests/).click();
  await page.locator('body').click();

  await page.keyboard.press('Escape');

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(railButton(page, /^Pull requests/)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-pr-row][data-pr-number="42"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
});

test('a pushed detail view pops with Esc and returns to the same list', async ({ page }) => {
  await bootRail(page);
  await railButton(page, /^Pull requests/).click();
  await expect(page.locator('[data-pr-row][data-pr-number="42"]')).toBeVisible();

  await pushView(page, { kind: 'pr-detail', owner: 'test-org', repo: 'borgdock', number: 42 });

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '2');
  // PR #42 is in the list, so the detail shows its title straight away.
  await expect(page.getByRole('heading', { level: 1, name: 'Add cool feature' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  // The list stays mounted underneath, inert.
  await expect(page.locator('.bd-viewstack__list')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');

  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
  await expect(page.getByRole('heading', { level: 1, name: 'Add cool feature' })).toHaveCount(0);
  // The push/pop direction marker is cleared once the view transition ends.
  await expect(page.locator('html')).not.toHaveAttribute('data-view-transition', /.*/);
  await expect(railButton(page, /^Pull requests/)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-pr-row][data-pr-number="42"]')).toBeVisible();
});

test('the Back button and Alt+ArrowLeft pop too', async ({ page }) => {
  await bootRail(page);
  const push = () => pushView(page, { kind: 'work-item-detail', id: 9001 });

  await push();
  await expect(page.getByRole('article', { name: 'Work item AB#9001' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');

  await push();
  await expect(page.getByRole('article', { name: 'Work item AB#9001' })).toBeVisible();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('.bd-viewstack')).toHaveAttribute('data-depth', '1');
});
