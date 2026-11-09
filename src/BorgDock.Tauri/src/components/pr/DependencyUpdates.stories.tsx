// Dependency updates: the strip above the Pull requests list, a bot PR's row
// Approve, and the Approve dependency updates sheet with the safe updates
// picked. Design: design/dependency-approve/mockups.html.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { FIXTURE_ME, listPr } from './__fixtures__/pr-list-data';
import { DependencySheetHost } from './DependencyUpdates';
import { PrList } from './PrList';

function bot(
  number: number,
  title: string,
  repo: string,
  extra: Partial<Parameters<typeof listPr>[0]> = {},
  body = '',
): PullRequestWithChecks {
  const pr = listPr({
    number,
    title,
    repo,
    author: repo.endsWith('api') ? 'renovate' : 'dependabot',
    requestedReviewers: [FIXTURE_ME],
    checks: { total: 12 },
    ...extra,
  });
  pr.pullRequest.body = body;
  return pr;
}

function dependencyPrs(): PullRequestWithChecks[] {
  return [
    bot(412, 'build(deps): bump lodash from 4.17.20 to 4.17.21', 'acme/web', {
      updatedHoursAgo: 2,
    }),
    bot(415, 'build(deps-dev): bump vitest from 3.1.1 to 3.2.0', 'acme/web', {
      checks: { total: 12, run: 3 },
      updatedHoursAgo: 3,
    }),
    bot(
      417,
      'build(deps-dev): bump the minor-and-patch group with 3 updates',
      'acme/web',
      { updatedHoursAgo: 4 },
      [
        'Updates `@types/node` from 22.1.0 to 22.2.0',
        'Updates `eslint` from 9.1.0 to 9.1.1',
        'Updates `prettier` from 3.3.0 to 3.4.0',
      ].join('\n'),
    ),
    bot(419, 'build(deps): bump react-router from 6.30.0 to 7.6.1', 'acme/web', {
      updatedHoursAgo: 20,
    }),
    bot(
      90,
      'chore(deps): update dependency serde to v1.0.219',
      'acme/api',
      { checks: { total: 8 }, updatedHoursAgo: 5 },
      '| Package | Change |\n|---|---|\n| [serde](https://serde.rs) | `1.0.218` -> `1.0.219` |',
    ),
    bot(
      86,
      'chore(deps): update rust crate tokio to v1.45.0',
      'acme/api',
      { checks: { total: 8 }, updatedHoursAgo: 26 },
      '| Package | Change |\n|---|---|\n| [tokio](https://tokio.rs) | `1.44.2` -> `1.45.0` |',
    ),
    bot(
      84,
      'chore(deps): update rust crate axum to v0.8.4',
      'acme/api',
      { checks: { total: 8 }, mergeable: false, updatedHoursAgo: 30 },
      '| Package | Change |\n|---|---|\n| [axum](https://github.com/tokio-rs/axum) | `0.8.3` -> `0.8.4` |',
    ),
    listPr({
      number: 409,
      title: 'Planner: drag a visit onto another technician',
      repo: 'acme/web',
      author: 'mvos',
      requestedReviewers: [FIXTURE_ME],
      checks: { total: 14 },
      updatedHoursAgo: 1,
    }),
  ];
}

function Harness({ sheet = false }: { sheet?: boolean }) {
  useState(() => {
    const now = Date.now();
    usePrStore.setState({
      pullRequests: dependencyPrs(),
      closedPullRequests: [],
      username: FIXTURE_ME,
      teams: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      isPolling: false,
      lastPollTime: new Date(now),
      relatedFailure: null,
    });
    useUiStore.setState({
      activeSection: 'prs',
      prGroupBy: 'repo',
      selectedPrKey: sheet ? null : 'acme/web#415',
      selectedPrNumber: sheet ? null : 415,
      collapsedGroups: new Set(),
      viewStack: [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ui: { ...s.settings.ui, prDensity: 'comfortable' } },
    }));
    return null;
  });
  return (
    <div
      className="flex h-screen flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PrList />
      </div>
      <DependencySheetHost />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'PR/Dependency updates',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** The strip above the list; #415 is selected, so its row shows Approve. */
export const Strip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('7 dependency updates')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Approve #415' })).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Review #409' })).toBeTruthy();
  },
};

export const StripLight: Story = { globals: { theme: 'light' } };

/** The sheet, opened from the strip: patch and minor updates picked. */
export const Sheet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Approve 5…' }));
    await expect(await canvas.findByRole('button', { name: 'Approve 5' })).toBeTruthy();
  },
};

export const SheetLight: Story = { ...Sheet, globals: { theme: 'light' } };
