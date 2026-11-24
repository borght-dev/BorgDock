import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntry } from '@/services/activity/types';

const mocks = vi.hoisted(() => ({
  entries: [] as unknown[],
  openHistory: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve({ status: 'ok', data: null })),
  actHere: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    listEntries: (query: { filter: string; limit: number }) => {
      const all = mocks.entries as ActivityEntry[];
      const matched =
        query.filter === 'needs-you'
          ? all.filter((e) => e.read === 'unread' && e.needsYou && e.status === 'open')
          : all;
      return Promise.resolve({
        entries: matched.slice(0, query.limit),
        total: matched.length,
        revision: 1,
      });
    },
    listSources: () => Promise.resolve([{ sourceId: 't3:mini', label: 'Mac mini' }]),
  };
});
vi.mock('@/services/activity/history', () => ({
  openActivityHistory: mocks.openHistory,
}));
vi.mock('@/generated/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/generated/commands')>();
  return {
    ...actual,
    commands: { ...actual.commands, openSettingsWindow: mocks.openSettings },
  };
});
vi.mock('../take-action', () => ({ actHere: mocks.actHere }));

import { useActivityStore } from '@/stores/activity-store';
import { useUiStore } from '@/stores/ui-store';
import {
  manyNeedingYou,
  RECENT_EARLIER,
  RECENT_LOOKED_AT,
  RECENT_NEEDS_YOU,
  RECENT_NOW,
} from '../__fixtures__/recent-data';
import { RailRecent, recentLabel } from '../RailRecent';
import { RecentCard } from '../RecentCard';

function journal(entries: ActivityEntry[]) {
  mocks.entries = entries;
  const needsYou = entries.filter((e) => e.needsYou).length;
  useActivityStore.setState({
    counts: { unread: entries.length, needsYou, byCategory: {}, bySource: {}, revision: 1 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ activityVisitedAt: RECENT_LOOKED_AT });
});

describe('RecentCard', () => {
  it('names what needs me now, where and how long ago, with the action that fits', async () => {
    journal([...RECENT_NEEDS_YOU, ...RECENT_EARLIER]);
    const close = vi.fn();
    render(<RecentCard close={close} now={RECENT_NOW} />);

    expect(await screen.findByText('3 checks failed on #431 Cart totals rounding')).toBeVisible();
    expect(screen.getByText('Needs you now').textContent).toBe('Needs you now 3');
    expect(screen.getByText('acme/storefront · 14 min ago')).toBeVisible();
    expect(screen.getByText('Fix cart totals · Mac mini · 31 min ago')).toBeVisible();

    // The review's pull request is not in this test's list, so its action is to open it;
    // the thread that asks is gone, so the question has none.
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open checks' }));
    expect(close).toHaveBeenCalled();
    expect(mocks.actHere).toHaveBeenCalledWith(RECENT_NEEDS_YOU[0]);
  });

  it('lists what else happened today, the quiet CI growth as one line', async () => {
    journal([...RECENT_NEEDS_YOU, ...RECENT_EARLIER]);
    render(<RecentCard close={() => {}} now={RECENT_NOW} />);
    expect(await screen.findByText('Earlier today')).toBeVisible();
    expect(screen.getByText('2 CI failure groups grew, none on your PRs')).toBeVisible();
    expect(screen.getByText('#412 Price table migration was merged')).toBeVisible();
    expect(screen.queryByText(/now fails on 3 PRs/)).toBeNull();
  });

  it('says when I last looked, and opening it counts as looking', async () => {
    journal(RECENT_EARLIER);
    const { unmount } = render(<RecentCard close={() => {}} now={RECENT_NOW} />);
    expect(await screen.findByText(/^since .*9[:.]12/)).toBeVisible();
    // The time stays while the card is open, and moves when it closes.
    expect(useUiStore.getState().activityVisitedAt).toBe(RECENT_LOOKED_AT);
    unmount();
    expect(useUiStore.getState().activityVisitedAt).not.toBe(RECENT_LOOKED_AT);
  });

  it('says so when nothing needs me, and when nothing happened at all', async () => {
    journal(RECENT_EARLIER);
    render(<RecentCard close={() => {}} now={RECENT_NOW} />);
    expect(await screen.findByText('Nothing needs you.')).toBeVisible();
    expect(screen.queryByText('Needs you now')).toBeNull();
    expect(screen.queryByText('Nothing else happened today.')).toBeNull();
    cleanup();

    journal([]);
    render(<RecentCard close={() => {}} now={RECENT_NOW} />);
    expect(await screen.findByText('Nothing else happened today.')).toBeVisible();
    expect(screen.queryByText('Earlier today')).toBeNull();
  });

  it('names five and counts the rest', async () => {
    journal(manyNeedingYou());
    render(<RecentCard close={() => {}} now={RECENT_NOW} />);
    expect(await screen.findByText('3 more in history')).toBeVisible();
    expect(document.querySelectorAll('[data-recent-entry]')).toHaveLength(5);
    expect(screen.getByText('Needs you now').textContent).toBe('Needs you now 8');
  });

  it('opens an entry, all history and the notification settings, closing itself', async () => {
    journal([...RECENT_NEEDS_YOU, ...RECENT_EARLIER]);
    const close = vi.fn();
    render(<RecentCard close={close} now={RECENT_NOW} />);

    fireEvent.click(await screen.findByText('dana asks for your review on #428 Gift card field'));
    expect(mocks.openHistory).toHaveBeenLastCalledWith(RECENT_NEEDS_YOU[2]!.id);

    fireEvent.click(screen.getByText('#412 Price table migration was merged'));
    expect(mocks.openHistory).toHaveBeenLastCalledWith(RECENT_EARLIER[0]!.id);

    fireEvent.click(screen.getByRole('button', { name: 'All history' }));
    expect(mocks.openHistory).toHaveBeenLastCalledWith(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Notification settings' }));
    expect(mocks.openSettings).toHaveBeenCalledWith('notif');
    expect(close).toHaveBeenCalledTimes(4);
  });
});

describe('RailRecent', () => {
  const badge = () => document.querySelector('.bd-rail__count--badge')?.textContent ?? null;

  it('is the bell with what needs me as a badge, folded or not', () => {
    journal(RECENT_NEEDS_YOU);
    const { rerender } = render(<RailRecent collapsed={false} />);
    expect(badge()).toBe('3');
    expect(screen.getByRole('button', { name: 'Recent · 3 need you' })).toBeVisible();
    expect(document.querySelector('[title="Recent · 3 need you"]')).not.toBeNull();
    expect(screen.queryByText('Recent')).toBeNull();
    rerender(<RailRecent collapsed />);
    expect(badge()).toBe('3');
  });

  it('carries no badge when nothing needs me, and "99+" above 99', () => {
    journal([]);
    render(<RailRecent collapsed={false} />);
    expect(badge()).toBeNull();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeVisible();
    cleanup();

    useActivityStore.setState({
      counts: { unread: 128, needsYou: 128, byCategory: {}, bySource: {}, revision: 2 },
    });
    render(<RailRecent collapsed />);
    expect(badge()).toBe('99+');
    expect(recentLabel(1)).toBe('Recent · 1 needs you');
  });

  it('opens the Recent card beside the rail', async () => {
    journal([...RECENT_NEEDS_YOU, ...RECENT_EARLIER]);
    render(<RailRecent collapsed={false} now={RECENT_NOW} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recent · 3 need you' }));
    const card = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(card).getByText('Needs you now').textContent).toBe('Needs you now 3'),
    );
    expect(within(card).getByRole('heading', { name: 'Recent' })).toBeVisible();
  });
});
