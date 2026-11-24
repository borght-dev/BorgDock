import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import type { ActivityEntry } from '@/services/activity/types';
import { makeThread } from '@/services/dispatch/__tests__/fixtures';
import { useActivityStore } from '@/stores/activity-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { seedActivity } from './__fixtures__/activity-data';
import {
  longSummaries,
  manyNeedingYou,
  RECENT_EARLIER,
  RECENT_LOOKED_AT,
  RECENT_NEEDS_YOU,
  RECENT_NOW,
  RECENT_REPO,
} from './__fixtures__/recent-data';
import { RailRecent } from './RailRecent';
import { RecentCard } from './RecentCard';

/**
 * The journal, the thread that asks and the pull requests the entries name,
 * so the card's actions are the ones it shows in the app.
 */
function seedRecent(entries: ActivityEntry[]): void {
  seedActivity({ entries });
  useUiStore.setState({ activityVisitedAt: RECENT_LOOKED_AT });
  useDispatchStore.setState({
    hosts: [
      {
        id: 'mini',
        label: 'Mac mini',
        ok: true,
        at: RECENT_NOW.toISOString(),
        error: null,
        environmentId: 'env-mini',
      },
    ],
    threads: [
      makeThread({
        id: 'mini:cart',
        hostId: 'mini',
        hostLabel: 'Mac mini',
        place: 'storefront',
        title: 'Fix cart totals',
        status: 'question',
        questionRequestId: 'req-7',
        questions: [
          {
            id: 'q1',
            question: 'Which rounding rule should cart totals use?',
            options: [
              { label: 'Half up', value: 'half-up' },
              { label: 'Half even', value: 'half-even' },
            ],
            recommended: 0,
            allowCustomAnswer: true,
            multiSelect: false,
          },
        ],
      }),
    ],
  });
  usePrStore.setState({
    pullRequests: entries
      .filter((item) => item.action?.kind === 'review-pr' || item.action?.kind === 'open-pr')
      .map((item) => {
        const number = Number(item.entity.key.slice(item.entity.key.indexOf('#') + 1));
        return listPr(
          { number, title: item.entity.title, repo: RECENT_REPO, author: 'dana' },
          RECENT_NOW.getTime(),
        );
      }),
  });
}

interface HarnessProps {
  entries: ActivityEntry[];
  /** Show the bell in a rail's foot instead of the card alone. */
  rail?: 'expanded' | 'folded';
  /** With the bell: start with the card open beside the rail. */
  open?: boolean;
  /** Overrides the count on the bell (the journal still has `entries`). */
  needsYou?: number;
}

/** A stand-in for the rail: the real one places the bell in its bar of icon buttons. */
function Rail({ folded, children }: { folded: boolean; children: ReactNode }) {
  return (
    <div className="grid h-[520px] grid-cols-[auto_1fr] bg-[var(--color-background)]">
      <aside
        className={folded ? 'bd-rail bd-rail--collapsed' : 'bd-rail'}
        style={{ width: folded ? 56 : 200 }}
        aria-label="Navigation"
      >
        <div
          className="mt-auto flex gap-1"
          style={{ flexDirection: folded ? 'column' : 'row', alignItems: 'center' }}
        >
          {children}
        </div>
      </aside>
      <div />
    </div>
  );
}

function Harness({ entries, rail, open = false, needsYou }: HarnessProps) {
  useState(() => {
    seedRecent(entries);
    if (needsYou !== undefined) {
      const counts = useActivityStore.getState().counts;
      if (counts) useActivityStore.setState({ counts: { ...counts, needsYou } });
    }
    return null;
  });
  if (rail) {
    return (
      <Rail folded={rail === 'folded'}>
        <RailRecent collapsed={rail === 'folded'} defaultOpen={open} now={RECENT_NOW} />
      </Rail>
    );
  }
  return (
    <div className="bg-[var(--color-background)] p-6">
      <div style={{ width: 380 }}>
        <RecentCard close={() => {}} now={RECENT_NOW} />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Activity/Recent',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

const ALL = [...RECENT_NEEDS_YOU, ...RECENT_EARLIER];

/** C1: three things need you, and the morning's merge, deploy, report and CI growth. */
export const Card: Story = { args: { entries: ALL } };

/** Nothing needs you; the day still happened. */
export const NothingNeedsYou: Story = { args: { entries: RECENT_EARLIER } };

/** A quiet day: nothing needs you and nothing happened. */
export const Empty: Story = { args: { entries: [] } };

/** Only things that need you. */
export const OnlyNeedsYou: Story = { args: { entries: RECENT_NEEDS_YOU } };

/** Eight need you: five are named, the rest are in history. */
export const ManyNeedYou: Story = { args: { entries: [...manyNeedingYou(), ...RECENT_EARLIER] } };

/** Long sentences take two lines and stop. */
export const LongSummaries: Story = { args: { entries: longSummaries() } };

/** The bell in the rail's bar, with what needs you as a badge. */
export const Bell: Story = { args: { entries: ALL, rail: 'expanded' } };

/** Nothing needs you: the bell alone. */
export const BellQuiet: Story = { args: { entries: RECENT_EARLIER, rail: 'expanded' } };

/** More than 99 reads "99+". */
export const BellMany: Story = { args: { entries: ALL, rail: 'expanded', needsYou: 128 } };

/** The folded rail: the same bell, stacked. */
export const BellFolded: Story = { args: { entries: ALL, rail: 'folded' } };

/** The card opens beside the rail, level with the bell and kept inside the window. */
export const Open: Story = { args: { entries: ALL, rail: 'expanded', open: true } };

/** The same from a folded rail. */
export const OpenFolded: Story = { args: { entries: ALL, rail: 'folded', open: true } };
