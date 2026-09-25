import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { flipMock } = vi.hoisted(() => ({
  // Runs the mutation like flip() does, without measuring anything.
  flipMock: vi.fn(
    (
      _container: HTMLElement | null,
      mutate: () => void,
      _selector?: string,
      _options?: unknown,
    ) => {
      mutate();
      return Promise.resolve([] as Animation[]);
    },
  ),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
  getClientForRepo: vi.fn(() => null),
}));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
  }),
}));
vi.mock('@/utils/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/motion')>()),
  flip: flipMock,
}));

import { NEEDS_YOU_GROUP_KEY } from '@/services/pr-grouping';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { FLIP_MAX_ROWS } from '@/utils/motion';
import {
  FIXTURE_ME,
  manyClosedPrs,
  manyOpenPrs,
  recentlyClosedPrs,
  workbenchPrs,
} from '../__fixtures__/pr-list-data';
import { FLIP_ROW_SELECTOR, PrList, VIRTUALIZE_THRESHOLD } from '../PrList';
import { prRowKey } from '../pr-card-data';

const NOW = Date.now();
const SETTINGS = useSettingsStore.getState().settings;

function seed({ prs = workbenchPrs(NOW), closed = [] as PullRequestWithChecks[] } = {}) {
  useSettingsStore.setState({ settings: SETTINGS });
  usePrStore.setState({
    pullRequests: prs,
    closedPullRequests: closed,
    filter: 'all',
    searchQuery: '',
    sortBy: 'updated',
    username: FIXTURE_ME,
    teams: [],
    isPolling: false,
    lastPollTime: new Date(NOW),
  });
  useUiStore.setState({
    prGroupBy: 'repo',
    collapsedGroups: new Set(),
    selectedPrNumber: null,
  });
}

function list() {
  return document.querySelector<HTMLElement>('.bd-wb-list')!;
}

function groupHeadings() {
  return [...document.querySelectorAll('.bd-wb-group__head')].map(
    (h) => h.querySelector('.bd-wb-group__label')!.textContent,
  );
}

describe('PrList', () => {
  beforeEach(() => {
    flipMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ settings: SETTINGS });
  });

  it('renders the head row, the segmented filter and one row per PR', () => {
    seed();
    render(<PrList />);
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter pull requests' })).toBeInTheDocument();
    expect(document.querySelector('[data-filter-chip]')).toBeNull();
    expect(document.querySelector('.bd-pr-toolbar__authors')).toBeNull();
    expect(document.querySelectorAll('.bd-wb-row')).toHaveLength(18);
  });

  it('shows the filter counts from the store', () => {
    seed();
    render(<PrList />);
    const group = screen.getByRole('group', { name: 'Filter pull requests' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All18', 'Needs you6', 'Mine6', 'Failing2']);
  });

  it('puts "Needs you" first, then the repositories, in sentence case with counts', () => {
    seed();
    render(<PrList />);
    expect(groupHeadings()).toEqual([
      'Needs you',
      'borght-dev/BorgDock',
      'borght-dev/site',
      'Gomocha-FSP/fsp-horizon',
      'Review load',
    ]);
    const needsYou = document.querySelector(`[data-group-key="${NEEDS_YOU_GROUP_KEY}"]`)!;
    expect(needsYou.querySelector('.bd-wb-group__count')).toHaveTextContent('6');
    expect(needsYou.querySelectorAll('.bd-wb-row')).toHaveLength(6);
    // The oldest review request's wait sits after the hairline.
    expect(needsYou.querySelector('[data-review-sla]')).not.toBeNull();
    // No uppercase labels anywhere in the Workbench list.
    expect(document.querySelector('.bd-wb-prs .uppercase')).toBeNull();
  });

  it('shows each PR once', () => {
    seed();
    render(<PrList />);
    // Each row sits in a wrapper with its action slot; the wrapper carries the key.
    const keys = [...list().querySelectorAll('.bd-wb-rowwrap[data-key]')].map((r) =>
      r.getAttribute('data-key'),
    );
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('FLIPs the rows on a filter change, fading the rows that leave', async () => {
    seed();
    render(<PrList />);
    const group = screen.getByRole('group', { name: 'Filter pull requests' });
    await act(async () => {
      fireEvent.click(within(group).getByRole('button', { name: /Failing/ }));
    });

    expect(flipMock).toHaveBeenCalledTimes(1);
    const [container, , selector, options] = flipMock.mock.calls[0]!;
    expect(container).toBe(list());
    expect(selector).toBe(FLIP_ROW_SELECTOR);
    const failing = usePrStore.getState().pullRequests.filter((p) => p.overallStatus === 'red');
    const leaving = (options as { leaving: string[] }).leaving;
    const leavingRows = leaving.filter((k) => !k.startsWith('group:'));
    expect(leavingRows).toHaveLength(18 - failing.length);
    for (const pr of failing) expect(leavingRows).not.toContain(prRowKey(pr.pullRequest));
    // Headings of groups with no failing rows fade too; "Needs you" is unpinned.
    expect(leaving).toContain(`group:${NEEDS_YOU_GROUP_KEY}`);
    expect(leaving).toContain('group:repo:borght-dev/site');
    expect(leaving).not.toContain('group:repo:borght-dev/BorgDock');

    expect(usePrStore.getState().filter).toBe('failing');
    expect(document.querySelectorAll('.bd-wb-row')).toHaveLength(2);
    // "Needs you" is only pinned under All.
    expect(groupHeadings()).not.toContain('Needs you');
    expect(within(group).getByRole('button', { name: /Failing/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('FLIPs on group-by and sort changes from the "Group and sort" menu', async () => {
    seed();
    render(<PrList />);

    fireEvent.click(screen.getByRole('button', { name: 'Group and sort' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Author' }));
    });
    expect(useUiStore.getState().prGroupBy).toBe('author');
    expect(flipMock).toHaveBeenCalledTimes(1);
    expect(flipMock.mock.calls[0]![3]).toEqual({ leaving: [] });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(groupHeadings()[1]).toContain('koen (you)');

    fireEvent.click(screen.getByRole('button', { name: 'Group and sort' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Title' }));
    });
    expect(usePrStore.getState().sortBy).toBe('title');
    expect(flipMock).toHaveBeenCalledTimes(2);
  });

  it('marks the current grouping and sort in the menu', () => {
    seed();
    render(<PrList />);
    fireEvent.click(screen.getByRole('button', { name: 'Group and sort' }));
    expect(screen.getByRole('menuitemradio', { name: 'Repo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Updated' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps a short Recently closed list in the FLIP set', () => {
    seed({ closed: recentlyClosedPrs(NOW) });
    render(<PrList />);
    const closed = document.querySelector('[data-group-key="recently-closed"]')!;
    expect(closed.querySelector('.bd-wb-group__label')).toHaveTextContent('Recently closed');
    const rows = closed.querySelectorAll('.bd-wb-rowwrap');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveAttribute('data-key');
    expect(closed.querySelector('[data-virtual]')).toBeNull();
  });

  it('skips FLIP for a virtualized Recently closed list and crossfades it instead', async () => {
    const animate = vi.fn();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    // jsdom has no layout: give the virtualizer a viewport so it renders rows.
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
    try {
      seed({ closed: manyClosedPrs(VIRTUALIZE_THRESHOLD + 10, NOW) });
      render(<PrList />);
      const virtual = document.querySelector<HTMLElement>('[data-virtual]')!;
      expect(virtual).not.toBeNull();
      // Recycled rows carry no data-key, so flip() never picks them up.
      expect(virtual.querySelectorAll('.bd-wb-row').length).toBeGreaterThan(0);
      expect(virtual.querySelectorAll(FLIP_ROW_SELECTOR)).toHaveLength(0);

      const group = screen.getByRole('group', { name: 'Filter pull requests' });
      await act(async () => {
        fireEvent.click(within(group).getByRole('button', { name: /Mine/ }));
      });
      expect(flipMock).toHaveBeenCalledTimes(1);
      const crossfades = animate.mock.contexts.filter((el) => el === virtual);
      expect(crossfades).toHaveLength(1);
      expect(animate.mock.calls[animate.mock.contexts.indexOf(virtual)]![0]).toEqual([
        { opacity: 0 },
        { opacity: 1 },
      ]);
    } finally {
      HTMLElement.prototype.animate = original;
      height.mockRestore();
      width.mockRestore();
    }
  });

  it('collapses and expands a group from its heading', () => {
    seed();
    render(<PrList />);
    const heading = document.querySelector<HTMLElement>(
      `[data-group-key="${NEEDS_YOU_GROUP_KEY}"] .bd-wb-group__head`,
    )!;
    const body = heading.parentElement!.querySelector('.bd-wb-group__body')!;
    expect(heading).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveAttribute('data-collapsed', 'true');
    expect(body.querySelector('.bd-wb-group__rows')).toHaveAttribute('inert');
    expect(useUiStore.getState().collapsedGroups.has(NEEDS_YOU_GROUP_KEY)).toBe(true);

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(body.querySelector('.bd-wb-group__rows')).not.toHaveAttribute('inert');
  });

  it('shows an empty state under a filter with no matches', () => {
    seed({ prs: workbenchPrs(NOW).filter((p) => p.overallStatus !== 'red') });
    render(<PrList />);
    const group = screen.getByRole('group', { name: 'Filter pull requests' });
    act(() => {
      fireEvent.click(within(group).getByRole('button', { name: /Failing/ }));
    });
    expect(screen.getByText('No pull requests match this filter')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
  });

  it('Esc in the search box clears it', () => {
    seed();
    render(<PrList />);
    const input = screen.getByRole('textbox', { name: 'Filter pull requests' });
    fireEvent.change(input, { target: { value: 'SQL' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(usePrStore.getState().searchQuery).toBe('');
  });

  it.each([
    ['needsReview', 'needsYou'],
    ['ready', 'all'],
    ['reviewing', 'all'],
    ['closed', 'all'],
  ] as const)('maps a filter the control does not offer (%s) onto %s', (from, to) => {
    seed();
    usePrStore.setState({ filter: from });
    render(<PrList />);
    expect(usePrStore.getState().filter).toBe(to);
    const group = screen.getByRole('group', { name: 'Filter pull requests' });
    const pressed = within(group)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAttribute('data-filter-key', to);
  });

  it('routes a Review load row through the filter control and FLIP', async () => {
    seed();
    render(<PrList />);
    const reviewer = document.querySelector<HTMLElement>(
      '[data-group-key="review-load"] .bd-wb-review-load button',
    )!;
    const login = reviewer.getAttribute('title')!.split(':')[0];
    await act(async () => {
      fireEvent.click(reviewer);
    });
    expect(flipMock).toHaveBeenCalledTimes(1);
    expect(usePrStore.getState().filter).toBe('needsYou');
    expect(usePrStore.getState().searchQuery).toBe(login);
  });

  it('dates the oldest review request, team requests included, without pulsing', () => {
    const prs = workbenchPrs(NOW);
    // #458 is waiting on me through a team only, requested 3 days ago.
    const teamOnly = prs.find((p) => p.pullRequest.number === 458)!;
    teamOnly.pullRequest.requestedReviewers = [];
    teamOnly.pullRequest.requestedTeams = ['platform'];
    const others = prs.filter((p) => p.pullRequest.number !== 458);
    for (const p of others) p.pullRequest.requestedReviewers = [];
    seed({ prs });
    usePrStore.setState({
      teams: ['platform'],
      reviewRequestTimestamps: {
        'borght-dev/BorgDock#458:team:platform': new Date(NOW - 3 * 24 * 3600e3).toISOString(),
      },
    });
    render(<PrList />);
    const aside = document.querySelector('[data-group-key="needs-you"] [data-review-sla]')!;
    expect(aside).toHaveAttribute('data-review-sla', 'stale');
    expect(aside).toHaveTextContent('3d');
    expect(aside.querySelector('.animate-pulse')).toBeNull();
  });

  describe('with 200 pull requests', () => {
    it('keeps Recently closed virtualized and crossfading', () => {
      seed({ prs: manyOpenPrs(200, NOW), closed: manyClosedPrs(200, NOW) });
      render(<PrList />);
      const virtual = document.querySelector('[data-group-key="recently-closed"] [data-virtual]');
      expect(virtual).not.toBeNull();
      expect(virtual).toHaveAttribute('data-crossfade');
      // Recycled rows carry no data-key, so FLIP never follows them.
      expect(virtual!.querySelector(FLIP_ROW_SELECTOR)).toBeNull();
      expect(virtual!.querySelectorAll('.bd-wb-row').length).toBeLessThan(200);
    });

    it('renders every open row and changes the filter without FLIP', async () => {
      seed({ prs: manyOpenPrs(200, NOW) });
      render(<PrList />);
      expect(list().querySelectorAll('.bd-wb-row[data-pr-key]')).toHaveLength(200);
      expect(list().querySelectorAll(FLIP_ROW_SELECTOR).length).toBeGreaterThan(FLIP_MAX_ROWS);

      const group = screen.getByRole('group', { name: 'Filter pull requests' });
      await act(async () => {
        fireEvent.click(within(group).getByRole('button', { name: /Failing/ }));
      });
      expect(flipMock).not.toHaveBeenCalled();
      expect(usePrStore.getState().filter).toBe('failing');
      expect(list().querySelectorAll('.bd-wb-row[data-pr-key]')).toHaveLength(40);
    });

    it('FLIPs again once the list is short enough', async () => {
      seed({ prs: manyOpenPrs(200, NOW) });
      usePrStore.setState({ filter: 'failing' });
      render(<PrList />);
      const group = screen.getByRole('group', { name: 'Filter pull requests' });
      await act(async () => {
        fireEvent.click(within(group).getByRole('button', { name: /Mine/ }));
      });
      expect(flipMock).toHaveBeenCalledTimes(1);
    });
  });
});
