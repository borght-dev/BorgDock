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
vi.mock('@/services/navigation', () => ({ showWorkItem: vi.fn() }));

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
      ['waiting', 4],
      ['drift', 2],
      ['working', 2],
      ['next', 2],
      ['idle', 4],
      ['paused', 1],
      ['handed', 1],
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
    expect(screen.getByRole('button', { name: /Handed off/ })).toBeInTheDocument();
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

  it('asks to set up Azure DevOps first', () => {
    seed();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, azureDevOps: { ...s.settings.azureDevOps, organization: '' } },
    }));
    render(<DispatchSection />);

    expect(screen.queryByRole('group', { name: 'Slots' })).not.toBeInTheDocument();
  });
});
