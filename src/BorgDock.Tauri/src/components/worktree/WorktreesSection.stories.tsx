// src/components/worktree/WorktreesSection.stories.tsx
//
// The main window's Worktrees section: repo groups, rows on
// the Workbench grammar with favourites, a dirty worktree, a conflicted one
// and one linked to an open pull request (its check bar and number), and
// the changes pane beside the list. Worktree data comes from the Storybook
// Tauri mock (`worktree_cache_get_all`, `list_worktrees`,
// `list_worktree_changes`); pull requests from the PR list fixture.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FIXTURE_ME, listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types/settings';
import type { WorktreeInfo, WorktreeSnapshot } from '@/types/worktree';
import type { UnifiedWorktreeDiff, WorktreeChangeSet } from '@/types/worktree-changes';
import { getControl } from '../../../.storybook/mocks/control';
import { WorktreesSection } from './WorktreesSection';

const HOUR = 60 * 60 * 1000;
const BORGDOCK = 'E:/dev/borgdock';
const SITE = 'E:/dev/borgdock-site';

const SNAPSHOT: WorktreeSnapshot = [
  {
    repo: { owner: 'borght-dev', name: 'BorgDock', basePath: BORGDOCK },
    entries: [
      { path: BORGDOCK, branchName: 'master', isMainWorktree: true },
      {
        path: `${BORGDOCK}/.worktrees/worktree1`,
        branchName: 'feature/471',
        isMainWorktree: false,
      },
      {
        path: `${BORGDOCK}/.worktrees/worktree2`,
        branchName: 'feature/482',
        isMainWorktree: false,
      },
      {
        path: `${BORGDOCK}/.worktrees/worktree3`,
        branchName: 'spike/sql-grid',
        isMainWorktree: false,
      },
      { path: `${BORGDOCK}/.worktrees/worktree4`, branchName: '', isMainWorktree: false },
      {
        path: `${BORGDOCK}/.worktrees/worktree10`,
        branchName: 'fix/tray-icon',
        isMainWorktree: false,
      },
    ],
    fetchedAt: 0,
  },
  {
    repo: { owner: 'borght-dev', name: 'borgdock-site', basePath: SITE },
    entries: [
      { path: SITE, branchName: 'main', isMainWorktree: true },
      { path: `${SITE}/.worktrees/worktree1`, branchName: 'copy/hero', isMainWorktree: false },
    ],
    fetchedAt: 0,
  },
];

function info(path: string, status: WorktreeInfo['status'], uncommittedCount = 0): WorktreeInfo {
  return {
    path,
    branchName: '',
    isMainWorktree: false,
    status,
    uncommittedCount,
    ahead: 0,
    behind: 0,
    commitSha: '',
  };
}

const STATUSES: Record<string, WorktreeInfo[]> = {
  [BORGDOCK]: [
    info(BORGDOCK, 'clean'),
    info(`${BORGDOCK}/.worktrees/worktree1`, 'dirty', 7),
    info(`${BORGDOCK}/.worktrees/worktree2`, 'clean'),
    info(`${BORGDOCK}/.worktrees/worktree3`, 'conflict', 2),
    info(`${BORGDOCK}/.worktrees/worktree4`, 'clean'),
    info(`${BORGDOCK}/.worktrees/worktree10`, 'dirty', 1),
  ],
  [SITE]: [info(SITE, 'clean'), info(`${SITE}/.worktrees/worktree1`, 'clean')],
};

const CHANGES: WorktreeChangeSet = {
  vsHead: [
    {
      path: 'src/components/sql/ResultsGrid.tsx',
      previousPath: null,
      status: 'modified',
      additions: 48,
      deletions: 12,
      isBinary: false,
      isSubmodule: false,
    },
    {
      path: 'src/hooks/useVirtualRows.ts',
      previousPath: null,
      status: 'untracked',
      additions: 64,
      deletions: 0,
      isBinary: false,
      isSubmodule: false,
    },
  ],
  vsBase: [
    {
      path: 'src/components/sql/ResultsGrid.tsx',
      previousPath: null,
      status: 'modified',
      additions: 120,
      deletions: 40,
      isBinary: false,
      isSubmodule: false,
    },
    {
      path: 'src/styles/sql.css',
      previousPath: null,
      status: 'modified',
      additions: 18,
      deletions: 3,
      isBinary: false,
      isSubmodule: false,
    },
    {
      path: 'CHANGELOG.md',
      previousPath: null,
      status: 'modified',
      additions: 4,
      deletions: 0,
      isBinary: false,
      isSubmodule: false,
    },
  ],
  baseBranch: 'master',
  baseBranchSource: 'origin-head',
  detachedHead: false,
  mergeBaseUnavailable: false,
};

const DIFF: UnifiedWorktreeDiff = {
  filePath: 'src/components/sql/ResultsGrid.tsx',
  previousPath: null,
  binary: null,
  isSubmodule: false,
  hunks: [
    {
      header: '@@ -10,6 +10,9 @@ export function ResultsGrid',
      oldStart: 10,
      oldCount: 6,
      newStart: 10,
      newCount: 9,
      lines: [
        {
          kind: 'context',
          content: '  const rows = useRows(result);',
          oldLineNumber: 10,
          newLineNumber: 10,
        },
        {
          kind: 'delete',
          content: '  return rows.map(renderRow);',
          oldLineNumber: 11,
          newLineNumber: null,
        },
        {
          kind: 'add',
          content: '  const virtual = useVirtualRows(rows, 32);',
          oldLineNumber: null,
          newLineNumber: 11,
        },
        {
          kind: 'add',
          content: '  return virtual.items.map(renderRow);',
          oldLineNumber: null,
          newLineNumber: 12,
        },
      ],
    },
  ],
};

interface HarnessProps {
  /** Favourites-only filter on. */
  favoritesOnly?: boolean;
  /** No repositories with worktrees. */
  empty?: boolean;
}

function Harness({ favoritesOnly = false, empty = false }: HarnessProps) {
  useState(() => {
    const now = Date.now();
    const ctrl = getControl();
    ctrl.invokeResponses.worktree_cache_get_all = empty ? [] : SNAPSHOT;
    ctrl.invokeResponses.worktree_cache_refresh = empty ? [] : SNAPSHOT;
    ctrl.invokeResponses.list_worktrees = (args: unknown) =>
      STATUSES[(args as { basePath: string }).basePath] ?? [];
    ctrl.invokeResponses.list_worktree_changes = CHANGES;
    ctrl.invokeResponses.diff_worktree_vs_head = DIFF;
    ctrl.invokeResponses.diff_worktree_vs_base = DIFF;
    ctrl.invokeResponses.save_settings = undefined;

    // "Last used": BorgDock opened two of them recently.
    localStorage.setItem(
      'borgdock-worktree-last-used',
      JSON.stringify({
        [`${BORGDOCK}/.worktrees/worktree1`]: now - 20 * 60 * 1000,
        [`${BORGDOCK}/.worktrees/worktree2`]: now - 26 * HOUR,
      }),
    );

    const repos: AppSettings['repos'] = empty
      ? []
      : [
          {
            owner: 'borght-dev',
            name: 'BorgDock',
            enabled: true,
            worktreeBasePath: BORGDOCK,
            worktreeSubfolder: '.worktrees',
            favoriteWorktreePaths: [
              `${BORGDOCK}/.worktrees/worktree1`,
              `${BORGDOCK}/.worktrees/worktree10`,
            ],
          },
          {
            owner: 'borght-dev',
            name: 'borgdock-site',
            enabled: true,
            worktreeBasePath: SITE,
            worktreeSubfolder: '.worktrees',
          },
        ];
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        repos,
        ui: { ...s.settings.ui, worktreePaletteFavoritesOnly: favoritesOnly },
      },
      hasLoaded: true,
    }));
    usePrStore.setState({
      pullRequests: [
        listPr(
          {
            number: 471,
            title: 'SQL: virtualize the results grid',
            repo: 'borght-dev/BorgDock',
            reviewStatus: 'changesRequested',
            checks: { total: 80, fail: 2 },
          },
          now,
        ),
        listPr(
          {
            number: 482,
            title: 'T3 Code: live agent sessions on pull requests',
            repo: 'borght-dev/BorgDock',
            reviewStatus: 'approved',
            checks: { total: 80, run: 12 },
          },
          now,
        ),
      ],
      username: FIXTURE_ME,
      lastPollTime: new Date(now),
    });
    useUiStore.setState({ activeSection: 'worktrees', viewStack: [{ kind: 'list' }] });
    return null;
  });
  return (
    <div
      className="flex h-screen flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <WorktreesSection />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Worktree/WorktreesSection',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/**
 * Two repositories: favourites starred (worktree1, worktree10), a dirty
 * worktree (7 changed), a conflicted one, a detached HEAD, and two linked to
 * open pull requests (#471 failing, #482 running).
 */
export const Default: Story = {};

/** The same list in the light theme. */
export const Light: Story = { globals: { theme: 'light' } };

/** Favourites only: the starred worktrees plus each repository's main one. */
export const FavoritesOnly: Story = { args: { favoritesOnly: true } };

/** A worktree selected: its uncommitted changes and commits ahead of master beside the list. */
export const WithChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = await canvas.findByRole('button', { name: /^feature\/471,/ });
    await userEvent.click(body);
    await waitFor(() =>
      expect(canvas.getByRole('complementary', { name: 'Changes in feature/471' })).toBeTruthy(),
    );
  },
};

/** A file of the selected worktree open in its diff, inside the changes pane. */
export const WithDiff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^feature\/471,/ }));
    const pane = await canvas.findByRole('complementary', { name: 'Changes in feature/471' });
    const files = await within(pane).findAllByTestId('file-change-row');
    await userEvent.click(files[0]!);
  },
};

/** No repository has a worktree base path yet. */
export const Empty: Story = { args: { empty: true } };
