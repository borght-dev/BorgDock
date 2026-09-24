// src/components/pr/PrRowCore.stories.tsx
//
// The Workbench row (plans/ui-overhaul-workbench.md, phase 2) as a state
// matrix: every chip, the three check states, an 80-check PR, own and stale
// PRs, the selected row, in both densities and both themes.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { BothThemes } from '@/test-support/story-themes';
import type { PrDensity } from '@/types';
import { FIXTURE_ME, type ListPrSpec, listPr } from './__fixtures__/pr-list-data';
import { PrRowCore } from './PrRowCore';
import { toPrCardData } from './pr-card-data';

const NOW = Date.now();

interface RowCase {
  caption: string;
  spec: ListPrSpec;
  selected?: boolean;
}

const repo = 'borght-dev/BorgDock';

const CASES: RowCase[] = [
  {
    caption: 'Approved, all passing (own)',
    spec: {
      number: 482,
      title: 'T3 Code: live agent sessions on pull requests',
      repo,
      reviewStatus: 'approved',
      checks: { total: 80 },
    },
  },
  {
    caption: 'Changes requested, 2 of 80 failing',
    spec: {
      number: 471,
      title: 'SQL: virtualize the results grid',
      repo,
      reviewStatus: 'changesRequested',
      checks: { total: 80, fail: 2 },
    },
  },
  {
    caption: 'Review requested, running',
    spec: {
      number: 88,
      title: 'Marketing site: real, sourced changelog page',
      repo: 'borght-dev/site',
      author: 'sasha',
      requestedReviewers: [FIXTURE_ME],
      checks: { total: 12, run: 5 },
      updatedHoursAgo: 26,
    },
  },
  {
    caption: 'Commented',
    spec: {
      number: 476,
      title: 'Settings: per-repository poll interval',
      repo,
      author: 'jules',
      reviewStatus: 'commented',
      checks: { total: 80 },
      updatedHoursAgo: 74,
    },
  },
  {
    caption: 'Draft',
    spec: {
      number: 84,
      title: 'Bump deps: Vite 8, Vitest 4, Storybook 10',
      repo: 'borght-dev/site',
      author: 'renovate',
      isDraft: true,
      checks: { total: 12 },
      updatedHoursAgo: 50,
    },
  },
  {
    caption: 'No review yet, some skipped',
    spec: {
      number: 470,
      title: 'Renovate: tauri 2.9 and plugins',
      repo,
      author: 'renovate',
      checks: { total: 80, skip: 4 },
      updatedHoursAgo: 146,
    },
  },
  {
    caption: 'Conflicts',
    spec: {
      number: 474,
      title: 'ADO: attachments tab in the detail window',
      repo,
      author: 'mira',
      reviewStatus: 'approved',
      mergeable: false,
      checks: { total: 80 },
      updatedHoursAgo: 98,
    },
  },
  {
    caption: 'Stale (no update in 9 days)',
    spec: {
      number: 462,
      title: 'Flyout: show failing checks first',
      repo,
      checks: { total: 80 },
      updatedHoursAgo: 9 * 24,
    },
  },
  {
    caption: 'Merged',
    spec: {
      number: 469,
      title: 'Status bar: keys for the current view',
      repo,
      reviewStatus: 'approved',
      checks: { total: 80 },
      updatedHoursAgo: 4,
      mergedHoursAgo: 4,
    },
  },
  {
    caption: 'Closed',
    spec: {
      number: 3590,
      title: 'Experiment: offline order drafts',
      repo: 'Gomocha-FSP/fsp-horizon',
      author: 'sander',
      checks: { total: 24, fail: 3 },
      updatedHoursAgo: 30,
      closedHoursAgo: 30,
    },
  },
  {
    caption: 'Selected',
    selected: true,
    spec: {
      number: 479,
      title: 'GraphQL polling: one call per repo, with a title long enough to be cut off',
      repo,
      author: 'mira',
      requestedReviewers: [FIXTURE_ME],
      checks: { total: 80 },
      updatedHoursAgo: 5,
    },
  },
];

function Matrix({ density }: { density: PrDensity }) {
  return (
    <div className="grid gap-4">
      {CASES.map(({ caption, spec, selected }) => {
        const prw = listPr(spec, NOW);
        const mine = prw.pullRequest.authorLogin === FIXTURE_ME;
        return (
          <div key={caption}>
            <div className="mb-1 text-[11.5px] text-[var(--color-text-tertiary)]">{caption}</div>
            <div className="bd-wb-list overflow-visible rounded-[var(--radius-lg)] border border-[var(--color-subtle-border)] bg-[var(--color-surface)] p-0">
              <PrRowCore
                pr={toPrCardData(prw, mine)}
                density={density}
                selected={selected}
                now={NOW}
                onClick={() => {}}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const meta: Meta = {
  title: 'PR/PrRowCore',
  globals: { theme: 'light' },
};
export default meta;
type Story = StoryObj;

export const Comfortable: Story = {
  render: () => <BothThemes>{() => <Matrix density="comfortable" />}</BothThemes>,
};

export const Compact: Story = {
  render: () => <BothThemes>{() => <Matrix density="compact" />}</BothThemes>,
};

/** Narrow list: the check label drops first, then the chip. */
export const Narrow: Story = {
  render: () => (
    <BothThemes>
      {() => (
        <div className="grid gap-6">
          {[600, 420].map((width) => (
            <div key={width} style={{ width }}>
              <div className="mb-1 text-[11.5px] text-[var(--color-text-tertiary)]">{width} px</div>
              <Matrix density="comfortable" />
            </div>
          ))}
        </div>
      )}
    </BothThemes>
  ),
};
