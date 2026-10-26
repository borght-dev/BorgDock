import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  answer: vi.fn(),
  approvePlan: vi.fn(),
  settle: vi.fn(),
  openInT3: vi.fn(),
  move: vi.fn(),
  hideSuggestion: vi.fn(),
  queue: vi.fn(),
  unqueue: vi.fn(),
  openInAdo: vi.fn(),
  openPullRequest: vi.fn(),
}));

vi.mock('@/services/dispatch/actions', () => ({ dispatchActions: actions }));
vi.mock('@/services/dispatch/sync', () => ({ syncAll: vi.fn() }));
vi.mock('@/services/navigation', () => ({ showWorkItem: vi.fn(), isMainWindow: () => true }));

import { syncAll } from '@/services/dispatch/sync';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { DispatchSection, groupByBay, searchItems } from '../DispatchSection';

function seed(overrides: Partial<ReturnType<typeof useDispatchStore.getState>> = {}) {
  const scene = makeDispatchScene(Date.parse('2026-10-12T12:00:00Z'));
  useDispatchStore.setState({
    items: scene.items,
    threads: scene.threads,
    projects: scene.projects,
    overview: scene.overview,
    ado: scene.ado,
    hosts: scene.hosts,
    selectedItemId: null,
    searchQuery: '',
    briefFilter: null,
    viewMode: 'list',
    busy: false,
    ...overrides,
  });
  return scene;
}

function configureAdo() {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      azureDevOps: {
        ...s.settings.azureDevOps,
        organization: 'acme',
        project: 'Shop',
        personalAccessToken: 'token',
      },
    },
  }));
}

describe('grouping and search', () => {
  const { overview } = makeDispatchScene(Date.parse('2026-10-12T12:00:00Z'));

  it('orders the bays by urgency and leaves empty ones out', () => {
    expect(groupByBay(overview.items).map((g) => [g.bay, g.rows.length])).toEqual([
      ['waiting', 5],
      ['drift', 1],
      ['working', 2],
      ['next', 2],
      ['idle', 5],
      ['paused', 2],
      ['handed', 3],
    ]);
  });

  it('finds items by title or number', () => {
    expect(searchItems(overview.items, 'csv').map((o) => o.item.id)).toEqual([60102]);
    expect(searchItems(overview.items, '6020').map((o) => o.item.id)).toEqual([60201]);
    expect(searchItems(overview.items, '  ')).toHaveLength(overview.items.length);
  });
});

describe('DispatchSection', () => {
  beforeEach(() => {
    for (const spy of Object.values(actions)) spy.mockReset();
    configureAdo();
  });

  it('shows the bays, the slots and the first item that waits on you', () => {
    seed();
    render(<DispatchSection />);

    expect(screen.getByRole('button', { name: /Waiting on you/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /In review or QA/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Slots' })).toHaveTextContent('5 free, 4 need you');

    const detail = screen.getByRole('article');
    expect(detail).toHaveAccessibleName('Order list loses its scroll position after refresh');
    expect(
      within(detail).getByText(/restore the position by row id or by pixel offset/),
    ).toBeInTheDocument();
  });

  it('answers the selected question with the picked option', () => {
    const scene = seed();
    render(<DispatchSection />);

    fireEvent.click(screen.getByRole('radio', { name: 'Restore by pixel offset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    const thread = scene.threads.find((t) => t.id === 't-60214');
    expect(actions.answer).toHaveBeenCalledWith(thread, { restore: 'Restore by pixel offset' });
  });

  it('selects a row on click and offers its next action', () => {
    seed();
    render(<DispatchSection />);

    fireEvent.click(screen.getByRole('button', { name: /Asset history on the detail page/ }));
    expect(useDispatchStore.getState().selectedItemId).toBe(59403);
  });

  it('moves an item that is out of sync', () => {
    const scene = seed({ selectedItemId: 59403 });
    render(<DispatchSection />);

    expect(screen.getByText('PR 3668 is merged. ADO still says Code Review.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Ready For QA' }));

    const item = scene.items.find((i) => i.id === 59403);
    expect(actions.move).toHaveBeenCalledWith(item, 'Ready For QA');
  });

  it('narrows the list to a count from its chip, and clears it', () => {
    seed();
    const { container } = render(<DispatchSection />);
    const shown = () =>
      [...container.querySelectorAll('[data-dp-id]')].map((row) => row.getAttribute('data-dp-id'));
    const chips = screen.getByRole('group', { name: 'Filter by count' });

    fireEvent.click(within(chips).getByRole('button', { name: /out of sync/ }));
    expect(shown().sort()).toEqual(['59403', '60102']);
    expect(chips).toHaveTextContent('Showing 2 of 20');

    fireEvent.click(within(chips).getByRole('button', { name: 'Clear' }));
    expect(shown()).toHaveLength(20);
  });

  it('narrows the list to the items agents work on', () => {
    seed({ briefFilter: 'working' });
    const { container } = render(<DispatchSection />);
    const working = () =>
      [...container.querySelectorAll('[data-dp-id]')].map((row) => row.getAttribute('data-dp-id'));
    expect(working().sort()).toEqual(['60031', '60150']);
  });

  it('filters the list while you type', () => {
    seed();
    const { container } = render(<DispatchSection />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter your work' }), {
      target: { value: 'timezone' },
    });

    expect(container.querySelectorAll('[data-dp-id]')).toHaveLength(1);
    expect(screen.getByRole('article')).toHaveAccessibleName(
      'Recurring jobs use the wrong timezone offset',
    );
  });

  it('offers to pair when T3 rejects BorgDock', () => {
    const scene = makeDispatchScene();
    seed({
      hosts: [
        {
          ...scene.hosts[0]!,
          ok: false,
          error:
            "T3 no longer accepts BorgDock's token. Pair BorgDock with T3 again in Settings, Agents.",
        },
      ],
    });
    render(<DispatchSection />);

    expect(screen.getByRole('button', { name: 'Pair with T3' })).toBeInTheDocument();
  });

  it('shows why ADO data is stale and offers a retry', () => {
    seed({
      ado: { ok: false, at: '2026-10-19T10:00:00Z', error: 'Azure DevOps sign-in expired.' },
    });
    render(<DispatchSection />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Work item data is out of date. Azure DevOps sign-in expired.',
    );
    vi.mocked(syncAll).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry ADO' }));
    expect(syncAll).toHaveBeenCalledWith(true);
  });

  it('asks to set up Azure DevOps first', () => {
    seed();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, azureDevOps: { ...s.settings.azureDevOps, organization: '' } },
    }));
    render(<DispatchSection />);

    expect(screen.queryByRole('group', { name: 'Slots' })).not.toBeInTheDocument();
  });
});
