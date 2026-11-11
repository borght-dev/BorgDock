import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn().mockResolvedValue(undefined),
  readFromTauriStore: vi.fn().mockResolvedValue(undefined),
}));
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

import { readPrListModel } from '@/hooks/usePrListModel';
import { __seedBranchStory } from '@/services/ci-failures/culprit';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { DEFAULT_DISPLAY, type PrDisplay } from '@/services/pr-list/display';
import type { SavedPrView } from '@/services/pr-list/facets';
import { YOUR_TURN_GROUP_KEY } from '@/services/pr-list/groups';
import { BUILT_IN_VIEWS, type PrViewKey } from '@/services/pr-list/model';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { usePrViewStore } from '@/stores/pr-view-store';
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
import { overviewCiGroups, overviewPrs } from '../__fixtures__/pr-overview-data';
import { FLIP_ROW_SELECTOR, PrList } from '../PrList';
import { prRowKey } from '../pr-card-data';
import { VIRTUALIZE_THRESHOLD } from '../VirtualizedRows';

const NOW = Date.now();
const SETTINGS = useSettingsStore.getState().settings;
const YOUR_TURN_STATUS_GROUP = 'status:yourTurn';

interface SeedOptions {
  prs?: PullRequestWithChecks[];
  closed?: PullRequestWithChecks[];
  filter?: PrViewKey;
  query?: string;
  display?: Partial<PrDisplay>;
  savedViews?: SavedPrView[];
  activeViewId?: string | null;
  ciGroups?: CiGroupSummary[];
}

/** Every store the list reads, as the stories seed them (`PrList.stories.tsx`). */
function seed({
  prs = workbenchPrs(NOW),
  closed = [],
  filter = 'all',
  query = '',
  display = {},
  savedViews = [],
  activeViewId = null,
  ciGroups = [],
}: SeedOptions = {}) {
  for (const group of ciGroups) __seedBranchStory(group, null);
  useSettingsStore.setState({ settings: SETTINGS });
  useCiFailuresStore.setState({ groups: ciGroups, loaded: true, revision: 1 });
  usePrStore.setState({
    pullRequests: prs,
    closedPullRequests: closed,
    filter,
    searchQuery: query,
    hideFailing: false,
    relatedFailure: null,
    username: FIXTURE_ME,
    teams: [],
    reviewRequestTimestamps: {},
    isPolling: false,
    lastPollTime: new Date(NOW),
  });
  const full: PrDisplay = { ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns], ...display };
  usePrViewStore.setState({
    display: full,
    baseDisplay: full,
    savedViews,
    activeViewId,
    showCiSummary: true,
    expandedGroups: new Set(),
  });
  useUiStore.setState({
    collapsedGroups: new Set(),
    selectedPrNumber: null,
    selectedPrKey: null,
  });
}

function list() {
  return document.querySelector<HTMLElement>('.bd-wb-list')!;
}

function tabs() {
  return screen.getByRole('tablist', { name: 'Pull request views' });
}

function tab(name: RegExp) {
  return within(tabs()).getByRole('tab', { name });
}

function groupHeadings() {
  return [...list().querySelectorAll('.bd-wb-group__head')].map(
    (h) => h.querySelector('.bd-wb-group__label')!.textContent,
  );
}

/** Open rows (not Recently closed), in screen order. */
function openRowNumbers() {
  return [...list().querySelectorAll('.bd-wb-row[data-pr-number]')]
    .filter((row) => !row.closest('[data-group-key="recently-closed"]'))
    .map((row) => Number(row.getAttribute('data-pr-number')));
}

function leavingOf(call: number) {
  return (flipMock.mock.calls[call]![3] as { leaving: string[] }).leaving;
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe('PrList', () => {
  beforeEach(() => {
    flipMock.mockClear();
    seed();
  });

  it('renders the head, the view tabs, the view bar and one row per PR', () => {
    render(<PrList />);
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filter pull requests' })).toBeInTheDocument();
    expect(
      within(tabs())
        .getAllByRole('tab')
        .map((t) => t.getAttribute('data-view-key')),
    ).toEqual(BUILT_IN_VIEWS.map((v) => v.key));
    expect(within(tabs()).getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(tab(/^All/)).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-view-bar]')).not.toBeNull();
    expect(document.querySelector('[data-filter-chip]')).toBeNull();
    expect(document.querySelector('[data-table-head]')).not.toBeNull();
    expect(openRowNumbers()).toHaveLength(18);
  });

  it('shows each tab’s count from the model', () => {
    render(<PrList />);
    const { counts } = readPrListModel();
    expect(
      within(tabs())
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(BUILT_IN_VIEWS.map((v) => `${v.label}${counts[v.key]}`));
    expect(counts).toMatchObject({ all: 18, mine: 6, failing: 2 });
  });

  it('shows each PR once', () => {
    render(<PrList />);
    // Each row sits in a wrapper with its action slot; the wrapper carries the key.
    const keys = [...list().querySelectorAll('.bd-wb-rowwrap[data-key]')].map((r) =>
      r.getAttribute('data-key'),
    );
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('groups by status by default, "Your turn" first, without uppercase labels', () => {
    render(<PrList />);
    const headings = groupHeadings();
    expect(headings[0]).toBe('Your turn');
    expect(headings).toContain('Review load');
    const yourTurn = document.querySelector(`[data-group-key="${YOUR_TURN_STATUS_GROUP}"]`)!;
    const count = readPrListModel().counts.needsYou;
    expect(yourTurn.querySelector('.bd-wb-group__count')).toHaveTextContent(String(count));
    expect(yourTurn.querySelectorAll('.bd-wb-row')).toHaveLength(count);
    // The oldest review request's wait sits after the hairline.
    expect(yourTurn.querySelector('[data-review-sla]')).not.toBeNull();
    expect(document.querySelector('.bd-wb-prs .uppercase')).toBeNull();
  });

  it('switches tabs, FLIPping the rows and fading the rows that leave', async () => {
    render(<PrList />);
    await click(tab(/^Failing/));

    expect(flipMock).toHaveBeenCalledTimes(1);
    const [container, , selector] = flipMock.mock.calls[0]!;
    expect(container).toBe(list());
    expect(selector).toBe(FLIP_ROW_SELECTOR);
    const failing = usePrStore.getState().pullRequests.filter((p) => p.overallStatus === 'red');
    const leaving = leavingOf(0);
    const leavingRows = leaving.filter((k) => !k.startsWith('group:'));
    expect(leavingRows).toHaveLength(18 - failing.length);
    for (const pr of failing) expect(leavingRows).not.toContain(prRowKey(pr.pullRequest));
    // Headings of groups that keep no row fade too.
    expect(leaving).toContain('group:status:waiting');

    expect(usePrStore.getState().filter).toBe('failing');
    expect(tab(/^Failing/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^All/)).toHaveAttribute('aria-selected', 'false');
    expect(openRowNumbers().sort()).toEqual(failing.map((p) => p.pullRequest.number).sort());

    await click(tab(/^Mine/));
    expect(flipMock).toHaveBeenCalledTimes(2);
    expect(usePrStore.getState().filter).toBe('mine');
    expect(openRowNumbers()).toHaveLength(readPrListModel().counts.mine);
  });

  it('pins "Your turn" above the repositories when grouped by repository from the Group menu', async () => {
    render(<PrList />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-group-button]')!);
    const menu = screen.getByRole('menu', { name: 'Group by' });
    expect(within(menu).getByRole('menuitemradio', { name: /^Status/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await click(within(menu).getByRole('menuitemradio', { name: /^Repository/ }));

    expect(usePrViewStore.getState().display.groupBy).toBe('repo');
    expect(screen.queryByRole('menu', { name: 'Group by' })).toBeNull();
    expect(flipMock).toHaveBeenCalledTimes(1);
    // Every row stays; only the status headings leave.
    expect(leavingOf(0).every((k) => k.startsWith('group:status:'))).toBe(true);
    expect(groupHeadings()).toEqual([
      'Your turn',
      'borght-dev/BorgDock',
      'borght-dev/site',
      'Gomocha-FSP/fsp-horizon',
      'Review load',
    ]);
    expect(document.querySelector(`[data-group-key="${YOUR_TURN_GROUP_KEY}"]`)).not.toBeNull();
    expect(openRowNumbers()).toHaveLength(18);
  });

  it('sorts from a column heading, and a second click reverses the order', async () => {
    seed({ display: { groupBy: 'none' } });
    render(<PrList />);
    const head = document.querySelector<HTMLElement>('[data-table-head]')!;
    const updated = within(head).getByRole('button', { name: /Updated/ });
    expect(updated).not.toHaveAttribute('aria-sort');

    await click(updated);
    expect(usePrViewStore.getState().display).toMatchObject({ sortBy: 'updated', sortDir: 'desc' });
    expect(within(head).getByRole('button', { name: /Updated/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    const newestFirst = openRowNumbers();
    expect(newestFirst).toEqual(readPrListModel().rows.map((f) => f.pr.pullRequest.number));
    const updatedAt = (n: number) =>
      readPrListModel().rows.find((f) => f.pr.pullRequest.number === n)!.updatedAt;
    expect(updatedAt(newestFirst[0]!)).toBeGreaterThanOrEqual(updatedAt(newestFirst.at(-1)!));

    await click(within(head).getByRole('button', { name: /Updated/ }));
    expect(usePrViewStore.getState().display.sortDir).toBe('asc');
    expect(within(head).getByRole('button', { name: /Updated/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const oldestFirst = openRowNumbers();
    expect(oldestFirst).toEqual(readPrListModel().rows.map((f) => f.pr.pullRequest.number));
    expect(updatedAt(oldestFirst[0]!)).toBeLessThanOrEqual(updatedAt(oldestFirst.at(-1)!));
    expect(flipMock).toHaveBeenCalledTimes(2);
    // A sort moves rows; none leave.
    expect(leavingOf(1)).toEqual([]);
  });

  it('switches to the board from the Display dialog', async () => {
    render(<PrList />);
    fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    const dialog = screen.getByRole('dialog', { name: 'Display options' });
    await click(within(dialog).getByRole('radio', { name: /Board/ }));

    expect(usePrViewStore.getState().display.layout).toBe('board');
    expect(flipMock).toHaveBeenCalledTimes(1);
    const board = list().querySelector('[data-board]')!;
    expect(board).not.toBeNull();
    expect(board.querySelectorAll('.bd-prl-card')).toHaveLength(18);
    expect(list().querySelector('[data-table-head]')).toBeNull();
    expect(list().querySelector('.bd-wb-row')).toBeNull();
    // The board leaves out Review load and Recently closed.
    expect(list().querySelector('[data-group-key="review-load"]')).toBeNull();
  });

  it('adds and removes a table column from the Display dialog', async () => {
    render(<PrList />);
    fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    const dialog = screen.getByRole('dialog', { name: 'Display options' });
    const created = within(dialog).getByRole('button', { name: 'Created' });
    expect(created).toHaveAttribute('aria-pressed', 'false');
    expect(list().querySelector('[data-col="created"]')).toBeNull();

    await click(created);
    expect(usePrViewStore.getState().display.columns).toContain('created');
    expect(within(dialog).getByRole('button', { name: 'Created' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const head = list().querySelector('[data-table-head]')!;
    expect(head.querySelector('[data-col="created"]')).not.toBeNull();
    expect(list().querySelectorAll('.bd-wb-row [data-col="created"]')).toHaveLength(18);

    await click(within(dialog).getByRole('button', { name: 'Size' }));
    expect(usePrViewStore.getState().display.columns).not.toContain('size');
    expect(list().querySelector('[data-col="size"]')).toBeNull();
  });

  describe('filters', () => {
    it('shows a chip per qualifier, and × removes one', async () => {
      seed({ query: 'author:mira checks:failing' });
      render(<PrList />);
      const chips = [...document.querySelectorAll('[data-filter-chip]')];
      expect(chips.map((c) => c.getAttribute('data-filter-chip'))).toEqual(['author', 'checks']);
      expect(chips[0]).toHaveTextContent(/Author\s*is\s*mira/);
      const narrowed = readPrListModel().rows.length;
      expect(openRowNumbers()).toHaveLength(narrowed);

      await click(screen.getByRole('button', { name: 'Remove Author filter' }));
      expect(usePrStore.getState().searchQuery).toBe('checks:failing');
      expect(
        [...document.querySelectorAll('[data-filter-chip]')].map((c) =>
          c.getAttribute('data-filter-chip'),
        ),
      ).toEqual(['checks']);
      expect(openRowNumbers()).toHaveLength(readPrListModel().rows.length);
      expect(readPrListModel().rows.length).toBeGreaterThanOrEqual(narrowed);
    });

    it('Clear drops every qualifier and keeps the free text', async () => {
      seed({ query: 'author:mira SQL' });
      render(<PrList />);
      await click(screen.getByRole('button', { name: 'Clear' }));
      expect(usePrStore.getState().searchQuery).toBe('SQL');
      expect(document.querySelector('[data-filter-chip]')).toBeNull();
    });

    it('adds repo: from a value checkbox in the Filter menu', async () => {
      render(<PrList />);
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
      const menu = screen.getByRole('menu', { name: 'Add a filter' });
      fireEvent.click(within(menu).getByRole('menuitem', { name: /Repository/ }));
      const site = within(menu).getByRole('menuitemcheckbox', { name: /^site/ });
      expect(site).toHaveAttribute('aria-checked', 'false');

      await click(site);
      expect(usePrStore.getState().searchQuery).toBe('repo:site');
      expect(within(menu).getByRole('menuitemcheckbox', { name: /^site/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(document.querySelector('[data-filter-chip="repo"]')).toHaveTextContent(/site/);
      const sitePrs = usePrStore
        .getState()
        .pullRequests.filter((p) => p.pullRequest.repoName === 'site')
        .map((p) => p.pullRequest.number);
      expect(openRowNumbers().sort()).toEqual(sitePrs.sort());
    });
  });

  describe('saved views', () => {
    it('saves the list as a view under a name and shows its tab', async () => {
      seed({ filter: 'failing' });
      render(<PrList />);
      fireEvent.click(within(tabs()).getByRole('button', { name: 'View' }));
      const dialog = screen.getByRole('dialog', { name: 'Save view' });
      const save = within(dialog).getByRole('button', { name: 'Save view' });
      expect(save).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('View name'), {
        target: { value: 'Red ones' },
      });
      await click(save);

      expect(screen.queryByRole('dialog', { name: 'Save view' })).toBeNull();
      const [view] = usePrViewStore.getState().savedViews;
      expect(view).toMatchObject({ name: 'Red ones', filter: 'failing', query: '' });
      expect(usePrViewStore.getState().activeViewId).toBe(view!.id);
      const saved = tab(/^Red ones/);
      expect(saved).toHaveAttribute('aria-selected', 'true');
      expect(saved).toHaveTextContent('Red ones2');
      expect(tab(/^Failing/)).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByRole('button', { name: 'Update view' })).toBeNull();
    });

    it('marks the view edited when the query changes, and Update view saves it', async () => {
      const view: SavedPrView = {
        id: 'view-red',
        name: 'Red ones',
        filter: 'failing',
        query: '',
        display: { ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns] },
      };
      seed({ filter: 'failing', savedViews: [view], activeViewId: view.id, display: view.display });
      render(<PrList />);
      expect(screen.queryByRole('button', { name: 'Update view' })).toBeNull();
      expect(within(tab(/^Red ones/)).queryByRole('img', { name: 'Unsaved changes' })).toBeNull();

      const input = screen.getByRole('textbox', { name: 'Filter pull requests' });
      fireEvent.change(input, { target: { value: 'author:me' } });
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(usePrStore.getState().searchQuery).toBe('author:me');
      expect(within(tab(/^Red ones/)).getByRole('img', { name: 'Unsaved changes' })).toBeVisible();

      await click(screen.getByRole('button', { name: 'Update view' }));
      expect(usePrViewStore.getState().savedViews[0]).toMatchObject({
        filter: 'failing',
        query: 'author:me',
      });
      expect(screen.queryByRole('button', { name: 'Update view' })).toBeNull();
      expect(within(tab(/^Red ones/)).queryByRole('img', { name: 'Unsaved changes' })).toBeNull();
    });

    it('leaving a saved view for a built-in tab drops its query', async () => {
      const view: SavedPrView = {
        id: 'view-site',
        name: 'Site',
        filter: 'all',
        query: 'repo:site',
        display: { ...DEFAULT_DISPLAY, columns: [...DEFAULT_DISPLAY.columns] },
      };
      seed({ query: view.query, savedViews: [view], activeViewId: view.id });
      render(<PrList />);
      await click(tab(/^Mine/));
      expect(usePrViewStore.getState().activeViewId).toBeNull();
      expect(usePrStore.getState()).toMatchObject({ filter: 'mine', searchQuery: '' });
      expect(tab(/^Site/)).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('shared CI failures summary', () => {
    beforeEach(() => {
      seed({ prs: overviewPrs(NOW), ciGroups: overviewCiGroups(NOW) });
    });

    it('is one line until opened, then a row per failure', async () => {
      render(<PrList />);
      const strip = screen.getByRole('region', { name: 'Shared CI failures' });
      const toggle = within(strip).getByRole('button', { expanded: false });
      expect(toggle).toHaveTextContent('3 shared CI failures block 6 PRs');
      expect(toggle).toHaveTextContent(/Worst:/);
      expect(strip.querySelectorAll('.bd-ci-strip__row')).toHaveLength(0);

      await click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(strip.querySelectorAll('.bd-ci-strip__row')).toHaveLength(3);
      expect(toggle).not.toHaveTextContent(/Worst:/);
    });

    it('× hides it and turns the summary off', async () => {
      render(<PrList />);
      await click(screen.getByRole('button', { name: 'Hide the shared CI failures summary' }));
      expect(usePrViewStore.getState().showCiSummary).toBe(false);
      expect(document.querySelector('[data-ci-strip]')).toBeNull();
    });
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

      await click(tab(/^Mine/));
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
    render(<PrList />);
    const heading = document.querySelector<HTMLElement>(
      `[data-group-key="${YOUR_TURN_STATUS_GROUP}"] .bd-wb-group__head`,
    )!;
    const body = heading.closest('.bd-wb-group')!.querySelector('.bd-wb-group__body')!;
    expect(heading).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveAttribute('data-collapsed', 'true');
    expect(body.querySelector('.bd-wb-group__rows')).toHaveAttribute('inert');
    expect(useUiStore.getState().collapsedGroups.has(YOUR_TURN_STATUS_GROUP)).toBe(true);

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(body.querySelector('.bd-wb-group__rows')).not.toHaveAttribute('inert');
  });

  it('shows an empty state for a tab with no matches', async () => {
    seed({ prs: workbenchPrs(NOW).filter((p) => p.overallStatus !== 'red') });
    render(<PrList />);
    expect(tab(/^Failing/)).toHaveTextContent('Failing0');
    await click(tab(/^Failing/));
    expect(screen.getByText('No pull requests match this view')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(document.querySelector('[data-table-head]')).toBeNull();
  });

  it('Esc in the search box clears it', () => {
    render(<PrList />);
    const input = screen.getByRole('textbox', { name: 'Filter pull requests' });
    fireEvent.change(input, { target: { value: 'SQL' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(usePrStore.getState().searchQuery).toBe('');
  });

  it('Enter in the search box applies the query at once', () => {
    render(<PrList />);
    const input = screen.getByRole('textbox', { name: 'Filter pull requests' });
    fireEvent.change(input, { target: { value: 'is:failing' } });
    expect(usePrStore.getState().searchQuery).toBe('');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(usePrStore.getState().searchQuery).toBe('is:failing');
    expect(document.querySelector('[data-filter-chip="is"]')).not.toBeNull();
    expect(openRowNumbers()).toHaveLength(2);
  });

  it('turns a Review load row into a reviewer: query, through FLIP', async () => {
    seed({ filter: 'mine' });
    render(<PrList />);
    const reviewer = document.querySelector<HTMLElement>(
      '[data-group-key="review-load"] .bd-wb-review-load button',
    )!;
    const login = reviewer.getAttribute('title')!.split(':')[0];
    await click(reviewer);
    expect(flipMock).toHaveBeenCalledTimes(1);
    expect(usePrStore.getState()).toMatchObject({
      filter: 'all',
      searchQuery: `reviewer:${login}`,
    });
    expect(document.querySelector('[data-filter-chip="reviewer"]')).toHaveTextContent(login!);
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
    const aside = document.querySelector(
      `[data-group-key="${YOUR_TURN_STATUS_GROUP}"] [data-review-sla]`,
    )!;
    expect(aside).toHaveAttribute('data-review-sla', 'stale');
    expect(aside).toHaveTextContent('3d');
    expect(aside.querySelector('.animate-pulse')).toBeNull();
  });

  it('puts the oldest review request on the pinned "Your turn" group too', () => {
    seed({ display: { groupBy: 'repo' } });
    render(<PrList />);
    expect(
      document.querySelector(`[data-group-key="${YOUR_TURN_GROUP_KEY}"] [data-review-sla]`),
    ).not.toBeNull();
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

    it('virtualizes large open groups and changes the tab without FLIP', async () => {
      const animate = vi.fn();
      const original = HTMLElement.prototype.animate;
      HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
      try {
        seed({ prs: manyOpenPrs(200, NOW) });
        render(<PrList />);
        expect(list().querySelectorAll('.bd-wb-row[data-pr-key]').length).toBeLessThan(200);
        expect(list().querySelector('[data-virtual-prs]')).not.toBeNull();
        expect(list().querySelectorAll(FLIP_ROW_SELECTOR).length).toBeLessThan(FLIP_MAX_ROWS);

        await click(tab(/^Failing/));
        expect(flipMock).not.toHaveBeenCalled();
        // The whole list crossfades as one block.
        expect(animate.mock.contexts).toContain(list());
        expect(usePrStore.getState().filter).toBe('failing');
        expect(list().querySelectorAll('.bd-wb-row[data-pr-key]')).toHaveLength(40);
      } finally {
        HTMLElement.prototype.animate = original;
      }
    });

    it('FLIPs again once the list is short enough', async () => {
      seed({ prs: manyOpenPrs(200, NOW), filter: 'failing' });
      render(<PrList />);
      await click(tab(/^Mine/));
      expect(flipMock).toHaveBeenCalledTimes(1);
    });
  });
});
