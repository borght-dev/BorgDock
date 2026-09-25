import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { MockHandlers } from './helpers/mock-tauri';
import { seedScenario } from './helpers/seed';
import { bootApp } from './helpers/test-utils';

/**
 * Colour contrast in the tool windows, in both themes
 * (plans/ui-overhaul-workbench.md, phase 6 acceptance): the SQL results grid,
 * the file palette's result rows and the Settings inputs. Each window boots
 * from its own HTML entry with the theme set in the saved settings, so the
 * check runs against what `startWindowTheme` applies, not a forced class.
 * axe runs its `color-contrast` rule on the named region only.
 */

type Theme = 'light' | 'dark';

/** The scenario's settings with the theme (and extras) swapped in. */
function settingsFor(
  scenario: 'happy-path' | 'palette-loaded',
  theme: Theme,
  extra: Record<string, unknown> = {},
): MockHandlers {
  const handlers = seedScenario(scenario);
  const base = handlers.load_settings as Record<string, unknown> & { ui: Record<string, unknown> };
  return { ...handlers, load_settings: { ...base, ...extra, ui: { ...base.ui, theme } } };
}

async function expectTheme(page: Page, theme: Theme) {
  const html = page.locator('html');
  if (theme === 'dark') await expect(html).toHaveClass(/\bdark\b/);
  else await expect(html).not.toHaveClass(/\bdark\b/);
}

async function expectContrast(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withRules(['color-contrast'])
    .analyze();
  const failures = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`),
  );
  expect(failures).toEqual([]);
}

const SQL_CONNECTION = {
  name: 'Local dev',
  server: 'localhost',
  port: 1433,
  database: 'BorgDock',
  authentication: 'windows',
  trustServerCertificate: true,
};

const SQL_RESULT = {
  resultSets: [
    {
      columns: ['Id', 'Name', 'Email', 'Notes'],
      rows: Array.from({ length: 12 }, (_, i) => [
        String(i + 1),
        `Customer ${i + 1}`,
        `customer${i + 1}@example.com`,
        i % 3 === 0 ? null : 'Prefers email',
      ]),
      rowCount: 12,
      truncated: false,
    },
  ],
  executionTimeMs: 28,
  totalRowCount: 12,
  rowsAffected: null,
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('SQL results grid meets colour contrast', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('borgdock-sql-last-query', 'SELECT TOP 12 * FROM dbo.Customer;');
      });
      await bootApp(page, 'sql.html', 'happy-path', {
        ...settingsFor('happy-path', theme, {
          sql: {
            connections: [SQL_CONNECTION],
            readOnlyByDefault: true,
            confirmDestructiveWithoutWhere: true,
          },
        }),
        execute_sql_query: SQL_RESULT,
      });
      await expectTheme(page, theme);

      await page.locator('[data-action="run-query"]').click();
      await expect(page.locator('[data-sql-results-table]')).toBeVisible();
      // Select a row so the selected state is checked too.
      await page.locator('.sql-data-row').nth(1).click();
      await expect(page.locator('.sql-data-row--selected')).toHaveCount(1);

      // Header columns sit over the row cells (rows carry the 2px selection edge).
      const headerCell = await page.locator('.sql-col-header').nth(1).boundingBox();
      const rowCell = await page.locator('.sql-data-row').first().locator('.sql-cell').nth(1).boundingBox();
      expect(headerCell?.x).toBe(rowCell?.x);
      expect(headerCell?.width).toBe(rowCell?.width);

      await expectContrast(page, '[data-sql-results-table]');
    });

    test('file palette rows meet colour contrast', async ({ page }) => {
      await bootApp(page, 'file-palette.html', 'palette-loaded', settingsFor('palette-loaded', theme));
      await expectTheme(page, theme);

      await page.getByRole('textbox', { name: /file palette search/i }).fill('file-00');
      await expect(page.locator('[data-file-result]').first()).toBeVisible();
      await page.locator('[data-file-result]').nth(1).hover();
      await expect(page.locator('[data-file-result][data-selected="true"]')).toHaveCount(1);

      await expectContrast(page, '.bd-fp-results');
      await expectContrast(page, '.bd-fp-scope-chips');
    });

    test('settings inputs meet colour contrast', async ({ page }) => {
      await bootApp(page, 'settings.html', 'happy-path', settingsFor('happy-path', theme));
      await expectTheme(page, theme);

      await page.getByRole('button', { name: /^Appearance$/ }).click();
      await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();

      await expectContrast(page, 'main');
      await expectContrast(page, 'aside');
    });
  });
}
