import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, reviewPrMock, mergeMock, showPrMock } = vi.hoisted(() => ({
  invokeMock: vi.fn((..._args: unknown[]) => Promise.resolve(undefined)),
  reviewPrMock: vi.fn(),
  mergeMock: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
  showPrMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
  getClientForRepo: vi.fn(() => null),
}));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(() => Promise.resolve()),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
  }),
}));
vi.mock('@/services/pr-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/pr-actions')>()),
  reviewPr: reviewPrMock,
  mergePrWithToast: mergeMock,
}));
vi.mock('@/services/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/navigation')>()),
  showPr: showPrMock,
}));

import { FIXTURE_ME, listPr, workbenchPrs } from '@/components/pr/__fixtures__/pr-list-data';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import type { FocusBucketContext } from '@/services/focus-bucket';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToastStore } from '@/stores/toast-store';
import { useUiStore } from '@/stores/ui-store';
import type { FocusLayout, PullRequestWithChecks } from '@/types';
import { FocusBoard, focusCardActionFor } from '../FocusBoard';
import { FocusList } from '../FocusList';

// To the minute, like the clock the Focus rows use, so ages read the same.
const NOW = Math.floor(Date.now() / 60_000) * 60_000;
const SETTINGS = useSettingsStore.getState().settings;

function byNumber(prs: PullRequestWithChecks[], n: number) {
  return prs.find((p) => p.pullRequest.number === n)!;
}

function ctx(over: Partial<FocusBucketContext> = {}): FocusBucketContext {
  return { username: FIXTURE_ME, teams: [], now: NOW, staleAfterDays: 7, ...over };
}

function seed({
  layout = 'board' as FocusLayout,
  prs = workbenchPrs(NOW),
  closed = [] as PullRequestWithChecks[],
} = {}) {
  useSettingsStore.setState({
    settings: { ...SETTINGS, ui: { ...SETTINGS.ui, focusLayout: layout } },
  });
  usePrStore.setState({
    pullRequests: prs,
    closedPullRequests: closed,
    filter: 'all',
    searchQuery: '',
    username: FIXTURE_ME,
    teams: [],
    reviewRequestTimestamps: {},
    isPolling: false,
    lastPollTime: new Date(NOW),
  });
  useUiStore.setState({
    activeSection: 'focus',
    focusFilter: 'all',
    focusSnoozes: {},
    selectedPrKey: null,
    selectedPrNumber: null,
    viewStack: [{ kind: 'list' }],
  });
}

/** Card numbers per column, top to bottom. */
function column(col: string): number[] {
  const el = document.querySelector(`[data-col="${col}"]`);
  if (!el) throw new Error(`no column ${col}`);
  return [...el.querySelectorAll<HTMLElement>('.bd-fb-card')].map((c) =>
    Number(c.dataset.prNumber),
  );
}

function card(n: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.bd-fb-card[data-pr-number="${n}"]`);
  if (!el) throw new Error(`no card #${n}`);
  return el;
}

function tally(): string {
  return document.querySelector('[data-merged-today]')?.getAttribute('data-merged-today') ?? '';
}

describe('FocusBoard', () => {
  beforeEach(() => {
    document.documentElement.classList.add('reduce-motion');
    vi.clearAllMocks();
    useToastStore.getState().clear();
    seed();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('places each fixture PR in its column, in rank order', () => {
    const prs = workbenchPrs(NOW);
    render(<FocusBoard prs={prs} ctx={ctx()} />);
    expect(column('you')).toEqual([471, 479, 88, 86, 3668]);
    expect(column('wait')).toEqual([84, 478, 476, 474, 470]);
    expect(column('ready')).toEqual([482, 3655]);
    expect(column('stale')).toEqual([462, 458, 451, 3601, 440, 433]);
    // Counts in the column heads.
    const head = (col: string) =>
      document.querySelector(`[data-col="${col}"] .bd-fb-col__count`)?.textContent;
    expect([head('you'), head('wait'), head('ready'), head('stale')]).toEqual(['5', '5', '2', '6']);
  });

  it('gives each card its reason and one action row for its shape', () => {
    const prs = workbenchPrs(NOW);
    render(<FocusBoard prs={prs} ctx={ctx()} />);
    const actionsOf = (n: number) =>
      [...card(n).querySelectorAll<HTMLElement>('[data-card-action]')].map(
        (b) => b.dataset.cardAction,
      );
    expect(within(card(479)).getByText('mira asked for your review 5 h ago.')).toBeTruthy();
    expect(actionsOf(479)).toEqual(['review', 'later']);
    expect(actionsOf(471)).toEqual(['fix', 'rerun']);
    expect(actionsOf(86)).toEqual(['comments', 'checkout']);
    expect(actionsOf(482)).toEqual(['merge', 'open']);
    expect(actionsOf(470)).toEqual(['open']);
    // Stale cards are compact: age, no reason, no actions.
    expect(actionsOf(462)).toEqual([]);
    expect(card(462).querySelector('[data-focus-reason]')).toBeNull();
    expect(within(card(462)).getByText('9 d')).toBeTruthy();
    expect(focusCardActionFor(byNumber(prs, 3655), 'ready', ctx())).toBe('merge');
  });

  it('Review opens Quick Review for that PR', () => {
    const prs = workbenchPrs(NOW);
    render(<FocusBoard prs={prs} ctx={ctx()} />);
    fireEvent.click(within(card(479)).getByRole('button', { name: 'Review #479' }));
    expect(reviewPrMock).toHaveBeenCalledWith(byNumber(prs, 479));
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('a card click opens the detail without leaving Focus', () => {
    render(<FocusBoard prs={workbenchPrs(NOW)} ctx={ctx()} />);
    fireEvent.click(within(card(474)).getByText('ADO: attachments tab in the detail window'));
    expect(showPrMock).toHaveBeenCalledWith({
      owner: 'borght-dev',
      repo: 'BorgDock',
      number: 474,
      keepSection: true,
    });
    expect(useUiStore.getState().selectedPrKey).toBe('borght-dev/BorgDock#474');
  });

  it('Later snoozes the review into Waiting until tomorrow, with Undo', async () => {
    render(<FocusList />);
    expect(column('you')).toContain(479);
    fireEvent.click(within(card(479)).getByRole('button', { name: 'Snooze #479 until tomorrow' }));
    await waitFor(() => expect(column('wait')).toContain(479));
    expect(column('you')).not.toContain(479);
    const until = useUiStore.getState().focusSnoozes['borght-dev/BorgDock#479'];
    expect(until).toBeGreaterThan(Date.now());
    expect(within(card(479)).getByText('Snoozed until tomorrow.')).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalledWith('save_settings', expect.anything());

    const toast = useToastStore.getState().toasts.slice(-1)[0]!;
    expect(toast.message).toBe('#479 snoozed until tomorrow');
    act(() => useToastStore.getState().act(toast.id));
    await waitFor(() => expect(column('you')).toContain(479));
  });

  it('Later stores the snooze before the fade, so an immediate Undo wins', async () => {
    document.documentElement.classList.remove('reduce-motion');
    // A fade that only finishes when the test says so.
    let endFade: () => void = () => {};
    const animate = vi.fn(() => {
      const finished = new Promise<void>((resolve) => {
        endFade = resolve;
      });
      return { finished, cancel: () => {} } as unknown as Animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      value: animate,
      configurable: true,
      writable: true,
    });
    try {
      render(<FocusList />);
      fireEvent.click(
        within(card(479)).getByRole('button', { name: 'Snooze #479 until tomorrow' }),
      );
      // Stored at once; the card is still fading in its old slot.
      expect(useUiStore.getState().focusSnoozes['borght-dev/BorgDock#479']).toBeGreaterThan(
        Date.now(),
      );
      expect(column('you')).toContain(479);
      const toast = useToastStore.getState().toasts.slice(-1)[0]!;
      act(() => useToastStore.getState().act(toast.id));
      expect(useUiStore.getState().focusSnoozes['borght-dev/BorgDock#479']).toBeUndefined();
      await act(async () => {
        endFade();
      });
      await waitFor(() => expect(column('you')).toContain(479));
      expect(column('wait')).not.toContain(479);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('a snoozed card offers Review first and Bring back, like its list row', () => {
    const prs = workbenchPrs(NOW);
    const p = byNumber(prs, 479);
    // Approved and green as well: Review still wins over Merge, on both.
    p.pullRequest.reviewStatus = 'approved';
    const snoozed = ctx({ snoozedUntil: { 'borght-dev/BorgDock#479': NOW + 60_000 } });
    render(<FocusBoard prs={prs} ctx={snoozed} />);
    expect(column('wait')).toContain(479);
    expect(column('ready')).not.toContain(479);
    const acts = [...card(479).querySelectorAll<HTMLElement>('[data-card-action]')].map(
      (b) => b.dataset.cardAction,
    );
    expect(acts).toEqual(['review', 'unsnooze']);
    expect(focusCardActionFor(p, 'you', ctx())).toBe('review');
  });

  it('Merge fills, flips to Merged, then the card goes and the tally bumps', async () => {
    document.documentElement.classList.remove('reduce-motion');
    let finish: (ok: boolean) => void = () => {};
    mergeMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(<FocusList />);
    expect(tally()).toBe('0');
    const merge = within(card(482)).getByRole('button', { name: 'Merge #482' });
    fireEvent.click(merge);
    await waitFor(() => expect(merge.textContent).toBe('Merging'));
    expect(merge.getAttribute('data-progress')).toBe('busy');
    expect(mergeMock).toHaveBeenCalledWith(
      expect.objectContaining({ repoOwner: 'borght-dev', repoName: 'BorgDock', number: 482 }),
    );

    // The merge lands: the store moves the PR to the closed list at once.
    await act(async () => {
      usePrStore.getState().optimisticallyMarkMerged('borght-dev', 'BorgDock', 482);
      finish(true);
    });
    // The card holds its slot and says so; the tally waits for it.
    expect(column('ready')).toEqual([482, 3655]);
    expect(within(card(482)).getByRole('button', { name: 'Merge #482' }).textContent).toBe(
      'Merged',
    );
    expect(tally()).toBe('0');

    await waitFor(() => expect(column('ready')).toEqual([3655]));
    expect(tally()).toBe('1');
    expect(document.querySelector('.bd-focus-done__count')?.textContent).toBe('1');
  });

  it('a failed merge leaves the card where it was', async () => {
    mergeMock.mockResolvedValueOnce(false);
    render(<FocusList />);
    fireEvent.click(within(card(482)).getByRole('button', { name: 'Merge #482' }));
    await waitFor(() =>
      expect(within(card(482)).getByRole('button', { name: 'Merge #482' }).textContent).toBe(
        'Merge',
      ),
    );
    expect(column('ready')).toEqual([482, 3655]);
    expect(tally()).toBe('0');
  });
});

describe('Workbench Focus', () => {
  beforeEach(() => {
    document.documentElement.classList.add('reduce-motion');
    vi.clearAllMocks();
    seed({ layout: 'list' });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('reduce-motion');
  });

  function rows(): number[] {
    return [...document.querySelectorAll<HTMLElement>('.bd-focus-list .bd-wb-row')].map((r) =>
      Number(r.dataset.prNumber),
    );
  }

  it('lists the Focus PRs with a reason each and says how many it shows', () => {
    render(<FocusList />);
    // Renovate's draft scores nothing and needs no one: it stays in Pull requests.
    expect(rows()).toHaveLength(17);
    expect(rows()).not.toContain(84);
    expect(screen.getByText(/Showing 17 of 18 open pull requests/)).toBeTruthy();
    expect(screen.getByText('Why not the others?')).toBeTruthy();
    const row479 = document.querySelector('.bd-wb-row[data-pr-number="479"]')!;
    expect(row479.querySelector('[data-focus-reason]')?.textContent).toBe(
      'mira asked for your review 5 h ago.',
    );
    expect(screen.getByRole('button', { name: 'Start Quick Review' })).toBeTruthy();
  });

  it('the count strip filters the list, and Everything resets it', () => {
    render(<FocusList />);
    const strip = screen.getByRole('group', { name: 'Filter Focus' });
    const segment = (label: RegExp) => within(strip).getByRole('button', { name: label });
    expect(segment(/^Needs you/).textContent).toBe('Needs you5');
    expect(segment(/^Waiting on others/).textContent).toBe('Waiting on others4');
    expect(segment(/^Ready to merge/).textContent).toBe('Ready to merge2');
    expect(segment(/^Stale/).textContent).toBe('Stale6');
    expect(segment(/^Everything/).textContent).toBe('Everything17');

    fireEvent.click(segment(/^Ready to merge/));
    expect(rows()).toEqual([482, 3655]);
    expect(segment(/^Ready to merge/).getAttribute('aria-pressed')).toBe('true');
    expect(useUiStore.getState().focusFilter).toBe('ready');

    fireEvent.click(segment(/^Needs you/));
    expect(rows().sort((a, b) => a - b)).toEqual([86, 88, 471, 479, 3668]);

    fireEvent.click(segment(/^Everything/));
    expect(rows()).toHaveLength(17);
  });

  it('the List / Board toggle switches the layout and saves it', async () => {
    vi.useFakeTimers();
    try {
      render(<FocusList />);
      const toggle = screen.getByRole('group', { name: 'Focus layout' });
      fireEvent.click(within(toggle).getByRole('button', { name: 'Board' }));
      expect(useSettingsStore.getState().settings.ui.focusLayout).toBe('board');
      expect(document.querySelector('[data-focus-board]')).toBeTruthy();
      expect(document.querySelector('.bd-focus-list')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(invokeMock).toHaveBeenCalledWith(
        'save_settings',
        expect.objectContaining({
          settings: expect.objectContaining({
            ui: expect.objectContaining({ focusLayout: 'board' }),
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('a snoozed row offers Bring back next to Review', async () => {
    useUiStore.setState({ focusSnoozes: { 'borght-dev/BorgDock#479': Date.now() + 60_000 } });
    render(<FocusList />);
    const row = () =>
      document.querySelector<HTMLElement>('.bd-wb-rowwrap[data-key="borght-dev/BorgDock#479"]')!;
    expect(row().querySelector('[data-focus-reason]')?.textContent).toBe('Snoozed until tomorrow.');
    expect(row().querySelector('[data-row-action="review"]')).not.toBeNull();
    fireEvent.click(within(row()).getByRole('button', { name: 'Bring #479 back to Needs you' }));
    await waitFor(() =>
      expect(useUiStore.getState().focusSnoozes['borght-dev/BorgDock#479']).toBeUndefined(),
    );
    expect(row().querySelector('[data-row-action="unsnooze"]')).toBeNull();
  });

  it('counts only my merges in Merged today', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const sinceMidnight = (Date.now() - midnight.getTime()) / 3_600_000;
    const mine = listPr(
      { number: 900, title: 'Mine', repo: 'a/b', mergedHoursAgo: sinceMidnight / 2 },
      NOW,
    );
    const theirs = listPr(
      {
        number: 901,
        title: 'Theirs',
        repo: 'a/b',
        author: 'mira',
        mergedHoursAgo: sinceMidnight / 2,
      },
      NOW,
    );
    seed({ layout: 'list', closed: [mine, theirs] });
    render(<FocusList />);
    expect(tally()).toBe('1');
  });
});

describe('Focus board keys', () => {
  function Harness() {
    useKeyboardNav();
    return <FocusList />;
  }

  function press(key: string) {
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }

  function selected(): number | null {
    const el = document.querySelector<HTMLElement>('.bd-fb-card[data-selected="true"]');
    return el ? Number(el.dataset.prNumber) : null;
  }

  beforeEach(() => {
    document.documentElement.classList.add('reduce-motion');
    vi.clearAllMocks();
    seed({ layout: 'board' });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('J/K move within a column, H/L and arrows across columns, Enter opens', () => {
    render(<Harness />);
    const you = column('you');
    const wait = column('wait');
    press('j');
    expect(selected()).toBe(you[0]);
    press('j');
    expect(selected()).toBe(you[1]);
    press('l');
    expect(selected()).toBe(wait[1]);
    press('ArrowRight');
    // Ready has two cards: the position is kept.
    expect(selected()).toBe(column('ready')[1]);
    press('k');
    expect(selected()).toBe(column('ready')[0]);
    press('h');
    expect(selected()).toBe(wait[0]);
    press('ArrowLeft');
    expect(selected()).toBe(you[0]);
    press('h');
    expect(selected()).toBe(you[0]);

    press('Enter');
    expect(showPrMock).toHaveBeenCalledWith({
      owner: 'borght-dev',
      repo: 'BorgDock',
      number: you[0],
      keepSection: true,
    });
  });

  it('M merges the card selected with H/L/J, and only when it is ready', () => {
    const queueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    try {
      render(<Harness />);
      press('j'); // Needs you, first card: my failing PR, not ready.
      press('m');
      expect(queueMerge).not.toHaveBeenCalled();
      press('l');
      press('l'); // Ready to merge, first card.
      press('j'); // Its second card.
      const target = column('ready')[1]!;
      expect(selected()).toBe(target);
      press('m');
      expect(queueMerge).toHaveBeenCalledTimes(1);
      expect(queueMerge).toHaveBeenCalledWith('Gomocha-FSP', 'fsp-horizon', target);
    } finally {
      delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    }
  });

  it('M in the filtered list merges the selected row, not the one at that index', () => {
    seed({ layout: 'list' });
    const queueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    try {
      render(<Harness />);
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Filter Focus' })).getByRole('button', {
          name: /^Ready to merge/,
        }),
      );
      press('j');
      press('j');
      const row = document.querySelector<HTMLElement>('.bd-wb-row[data-selected="true"]')!;
      expect(row.dataset.prNumber).toBe('3655');
      press('m');
      expect(queueMerge).toHaveBeenCalledTimes(1);
      expect(queueMerge).toHaveBeenCalledWith('Gomocha-FSP', 'fsp-horizon', 3655);
    } finally {
      delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    }
  });

  it('Enter on a button, a toggle or a summary is theirs, not the selected row', () => {
    seed({ layout: 'list' });
    render(<Harness />);
    press('j');
    expect(document.querySelector('.bd-wb-row[data-selected="true"]')).not.toBeNull();
    const targets = [
      screen.getByRole('button', { name: 'Start Quick Review' }),
      within(screen.getByRole('group', { name: 'Focus layout' })).getByRole('button', {
        name: 'Board',
      }),
      within(screen.getByRole('group', { name: 'Filter Focus' })).getByRole('button', {
        name: /^Stale/,
      }),
      screen.getByText('Why not the others?'),
    ];
    for (const target of targets) {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      act(() => {
        target.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(showPrMock).not.toHaveBeenCalled();
    // Enter from the page still opens the selected row.
    press('Enter');
    expect(showPrMock).toHaveBeenCalledTimes(1);
  });

  it('R starts Quick Review for the selected card', () => {
    const startSinglePr = vi.fn();
    useQuickReviewStore.setState({ startSinglePr });
    render(<Harness />);
    press('j');
    press('j');
    const second = column('you')[1]!;
    press('r');
    expect(startSinglePr).toHaveBeenCalledTimes(1);
    expect(startSinglePr.mock.calls[0]![0].pullRequest.number).toBe(second);
  });
});
