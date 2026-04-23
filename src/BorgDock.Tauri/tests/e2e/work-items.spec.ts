import { test, expect } from '@playwright/test';
import {
  injectCompletedSetup,
  waitForAppReady,
  switchSection,
} from './helpers/test-utils';

test.describe('Work Items Section', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('switching to Work Items tab shows the section', async ({ page }) => {
    await switchSection(page, 'Work Items');
    await page.waitForTimeout(300);

    // The Work Items section should be visible
    // Since ADO is not configured (empty org), it shows the "Configure" prompt
    await expect(
      page.getByText('Configure Azure DevOps in Settings to see work items')
    ).toBeVisible();
  });

  test('shows "Configure Azure DevOps" when not configured', async ({ page }) => {
    await switchSection(page, 'Work Items');
    await page.waitForTimeout(300);

    // With empty azureDevOps.organization, the unconfigured state should show
    await expect(
      page.getByText('Configure Azure DevOps in Settings to see work items')
    ).toBeVisible();
  });

  test('Work Items tab becomes active when clicked', async ({ page }) => {
    const workItemsBtn = page.getByRole('button', { name: 'Work Items' });
    await workItemsBtn.click();
    await page.waitForTimeout(200);

    // The button should have the active styling (accent background)
    // We verify by checking the class contains the accent color
    const classes = await workItemsBtn.getAttribute('class');
    expect(classes).toContain('bg-[var(--color-accent)]');
  });

  test('switching back to PRs tab shows PR content', async ({ page }) => {
    // Switch to Work Items
    await switchSection(page, 'Work Items');
    await page.waitForTimeout(200);

    // Switch back to PRs
    await switchSection(page, 'PRs');
    await page.waitForTimeout(200);

    // The filter bar and search should be visible again
    await expect(page.getByPlaceholder('Search PRs...')).toBeVisible();
  });

  test('Work Items section renders filter bar when ADO is configured', async ({ page }) => {
    // Inject settings with ADO configured
    await page.addInitScript(`
      window.__PRDOCK_MOCK_SETTINGS__ = {
        setupComplete: true,
        gitHub: { authMethod: 'pat', personalAccessToken: 'ghp_test123', pollIntervalSeconds: 60, username: 'testuser' },
        repos: [{ owner: 'test-org', name: 'test-repo', enabled: true, worktreeBasePath: '', worktreeSubfolder: '.worktrees' }],
        ui: { sidebarEdge: 'right', sidebarMode: 'pinned', sidebarWidthPx: 380, theme: 'dark', globalHotkey: 'Ctrl+Shift+P', editorCommand: 'code', runAtStartup: false, badgeStyle: 'GlassCapsule', indicatorStyle: 'SegmentRing' },
        notifications: { toastOnCheckStatusChange: true, toastOnNewPR: true, toastOnReviewUpdate: true },
        claudeCode: { defaultPostFixAction: 'commitAndNotify' },
        claudeReview: { botUsername: 'claude-code' },
        updates: { autoCheckEnabled: false, autoDownload: false },
        azureDevOps: {
          organization: 'my-org',
          project: 'my-project',
          personalAccessToken: 'ado-pat-123',
          pollIntervalSeconds: 120,
          favoriteQueryIds: [],
          trackedWorkItemIds: [],
          workingOnWorkItemIds: [],
          workItemWorktreePaths: {},
        },
      };
    `);

    await page.goto('/');
    await waitForAppReady(page);
    await switchSection(page, 'Work Items');
    await page.waitForTimeout(300);

    // With ADO configured, the filter bar should render with query selector
    await expect(page.getByText('Select a query...')).toBeVisible();
  });

  test('query browser button is visible when ADO is configured', async ({ page }) => {
    // Same setup as above with ADO configured
    await page.addInitScript(`
      window.__PRDOCK_MOCK_SETTINGS__ = {
        setupComplete: true,
        gitHub: { authMethod: 'pat', personalAccessToken: 'ghp_test123', pollIntervalSeconds: 60, username: 'testuser' },
        repos: [{ owner: 'test-org', name: 'test-repo', enabled: true, worktreeBasePath: '', worktreeSubfolder: '.worktrees' }],
        ui: { sidebarEdge: 'right', sidebarMode: 'pinned', sidebarWidthPx: 380, theme: 'dark', globalHotkey: 'Ctrl+Shift+P', editorCommand: 'code', runAtStartup: false, badgeStyle: 'GlassCapsule', indicatorStyle: 'SegmentRing' },
        notifications: { toastOnCheckStatusChange: true, toastOnNewPR: true, toastOnReviewUpdate: true },
        claudeCode: { defaultPostFixAction: 'commitAndNotify' },
        claudeReview: { botUsername: 'claude-code' },
        updates: { autoCheckEnabled: false, autoDownload: false },
        azureDevOps: {
          organization: 'my-org',
          project: 'my-project',
          personalAccessToken: 'ado-pat-123',
          pollIntervalSeconds: 120,
          favoriteQueryIds: [],
          trackedWorkItemIds: [],
          workingOnWorkItemIds: [],
          workItemWorktreePaths: {},
        },
      };
    `);

    await page.goto('/');
    await waitForAppReady(page);
    await switchSection(page, 'Work Items');
    await page.waitForTimeout(300);

    // The query browser button (the "Select a query..." button) should be clickable
    const queryBtn = page.getByText('Select a query...');
    await expect(queryBtn).toBeVisible();
  });
});
