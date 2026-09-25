import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(function MockAdoClient() {
    return { get: vi.fn(), getStream: vi.fn() };
  }),
}));
vi.mock('@/services/ado/queries', () => ({ executeQuery: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/ado/workitems', () => ({
  getWorkItem: vi.fn(() => new Promise(() => {})),
  getWorkItemComments: vi.fn().mockResolvedValue([]),
  getWorkItemTypeStates: vi.fn().mockResolvedValue([]),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
  downloadAttachment: vi.fn(),
}));
vi.mock('@/hooks/useAdoImageAuth', () => ({ useAdoImageAuth: vi.fn() }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AdoQuery, WorkItem } from '@/types';
import { useQuerySettled } from '../WorkbenchWorkItemsSection';
import { queryPickerMode } from '../WorkItemQueryPicker';
import { WorkItemsSection } from '../WorkItemsSection';

const settingsBefore = useSettingsStore.getState().settings;

function makeItem(id: number, type: string, state: string, title = `Item ${id}`): WorkItem {
  return {
    id,
    rev: 1,
    url: '',
    fields: {
      'System.Title': title,
      'System.State': state,
      'System.WorkItemType': type,
      'System.AssignedTo': 'Alice',
      'Microsoft.VSTS.Common.Priority': 2,
    },
    relations: [],
    htmlUrl: '',
  };
}

function query(id: string, name: string): AdoQuery {
  return { id, name, path: `Shared/${name}`, isFolder: false, hasChildren: false, children: [] };
}

const ITEMS = [
  makeItem(101, 'Bug', 'Active', 'Quote footer broken'),
  makeItem(102, 'Task', 'New', 'Wire the export'),
  makeItem(103, 'User Story', 'Active', 'Price list per customer'),
];

function setup(
  opts: { layoutV3?: boolean; favorites?: string[]; queries?: AdoQuery[]; items?: WorkItem[] } = {},
) {
  const {
    layoutV3 = true,
    favorites = ['q1', 'q2'],
    queries = [query('q1', 'My bugs'), query('q2', 'Sprint'), query('q3', 'Team backlog')],
    items = ITEMS,
  } = opts;
  useSettingsStore.setState({
    settings: {
      ...settingsBefore,
      ui: { ...settingsBefore.ui, layoutV3, prDensity: 'comfortable' },
      azureDevOps: {
        ...settingsBefore.azureDevOps,
        organization: 'org',
        project: 'proj',
        personalAccessToken: 'pat',
        authMethod: 'pat',
        favoriteQueryIds: favorites,
      },
    },
    isLoading: false,
  });
  useWorkItemsStore.setState({
    queryTree: queries,
    selectedQueryId: 'q1',
    favoriteQueryIds: favorites,
    workItems: items,
    stateFilter: 'all',
    assignedToFilter: '',
    searchQuery: '',
    trackingFilter: 'all',
    trackedWorkItemIds: new Set([103]),
    workingOnWorkItemIds: new Set(),
    isLoading: false,
  });
  useUiStore.setState({ viewStack: [{ kind: 'list' }], workItemsSelectedId: null });
}

describe('WorkItemsSection in the Workbench layout', () => {
  beforeEach(() => setup());
  afterEach(() => {
    useSettingsStore.setState({ settings: settingsBefore });
    useWorkItemsStore.setState({ workItems: [], queryTree: [], selectedQueryId: null });
    useUiStore.setState({ viewStack: [{ kind: 'list' }], workItemsSelectedId: null });
  });

  it('renders Workbench rows grouped by state under sentence-case headings with counts', () => {
    const { container } = render(<WorkItemsSection />);
    expect(screen.getByRole('heading', { level: 1, name: 'Work items' })).toBeInTheDocument();
    const heads = [...container.querySelectorAll('.bd-wb-group__head')].map((h) =>
      h.textContent?.trim(),
    );
    expect(heads).toEqual(['Active2', 'New1']);
    expect(container.querySelectorAll('.bd-wi-wb-row')).toHaveLength(3);
    // The tab layout's three panes are gone.
    expect(container.querySelector('.bd-workitems__detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Untrack AB#103' })).toHaveAttribute(
      'data-on',
      'true',
    );
  });

  it('offers a few favourite queries as a segmented control', () => {
    render(<WorkItemsSection />);
    const picker = screen.getByRole('group', { name: 'Query' });
    expect(within(picker).getByRole('button', { name: 'My bugs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(picker).getByRole('button', { name: 'Sprint' }));
    expect(useWorkItemsStore.getState().selectedQueryId).toBe('q2');
    expect(screen.getByRole('button', { name: 'Browse all queries' })).toBeInTheDocument();
  });

  it('keeps the queries rail when there are many queries', () => {
    const many = Array.from({ length: 20 }, (_, i) => query(`m${i}`, `Query ${i}`));
    setup({ favorites: [], queries: many });
    render(<WorkItemsSection />);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Query' })).not.toBeInTheDocument();
  });

  it('picks the query control by how many queries there are', () => {
    expect(queryPickerMode(2, 30)).toBe('segmented');
    expect(queryPickerMode(0, 8)).toBe('select');
    expect(queryPickerMode(6, 4)).toBe('select');
    expect(queryPickerMode(6, 10)).toBe('rail');
  });

  it('search filters the rows through the store and names the ⌘K shortcut', () => {
    const { container } = render(<WorkItemsSection />);
    const search = screen.getByRole('textbox', { name: 'Filter work items' });
    expect(search).toHaveAttribute('data-section-search');
    expect(search.parentElement?.querySelector('.bd-kbd')?.textContent).toMatch(/K$/);
    fireEvent.change(search, { target: { value: 'export' } });
    expect(useWorkItemsStore.getState().searchQuery).toBe('export');
    expect(container.querySelectorAll('.bd-wi-wb-row')).toHaveLength(1);
    expect(screen.getByText('Wire the export')).toBeInTheDocument();
  });

  it('a filter change updates the rows (FLIP runs the change)', async () => {
    const { container } = render(<WorkItemsSection />);
    await act(async () => {
      useWorkItemsStore.setState({ trackingFilter: 'tracked' });
    });
    expect(container.querySelectorAll('.bd-wi-wb-row')).toHaveLength(1);
  });

  it('clicking a row pushes its detail view and keeps it selected', async () => {
    const { container } = render(<WorkItemsSection />);
    fireEvent.click(container.querySelector('[data-wi-id="102"]')!);
    await waitFor(() =>
      expect(useUiStore.getState().viewStack.slice(-1)[0]).toEqual({
        kind: 'work-item-detail',
        id: 102,
      }),
    );
    expect(useUiStore.getState().workItemsSelectedId).toBe(102);
    expect(container.querySelector('[data-wi-id="102"]')).toHaveAttribute('data-selected', 'true');
  });

  it('asks for a query when none is selected', () => {
    useWorkItemsStore.setState({ selectedQueryId: null, workItems: [] });
    render(<WorkItemsSection />);
    expect(screen.getByText('Pick a query to see its work items')).toBeInTheDocument();
  });

  it('keeps the tab layout when the flag is off', () => {
    setup({ layoutV3: false });
    const { container } = render(<WorkItemsSection />);
    expect(container.querySelector('.bd-workitems')).toBeInTheDocument();
    expect(container.querySelector('.bd-wi-wb-row')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.bd-wi-row')).toHaveLength(3);
  });
});

describe('useQuerySettled', () => {
  it('settles a new query only once its new list has landed and loading is over', () => {
    const oldItems = [makeItem(1, 'Bug', 'Active')];
    const newItems = [makeItem(2, 'Task', 'New')];
    const { result, rerender } = renderHook(
      ({ q, items, loading }) => useQuerySettled(q, items, loading),
      { initialProps: { q: 'a' as string | null, items: oldItems, loading: false } },
    );
    expect(result.current).toBe('a');

    // Picked, still loading: the old rows show.
    rerender({ q: 'b', items: oldItems, loading: true });
    expect(result.current).toBeNull();
    // Loading over but the list not yet replaced: still not settled.
    rerender({ q: 'b', items: oldItems, loading: false });
    expect(result.current).toBeNull();
    // New list in, loading still on: not yet.
    rerender({ q: 'b', items: newItems, loading: true });
    expect(result.current).toBeNull();
    // Both: settled.
    rerender({ q: 'b', items: newItems, loading: false });
    expect(result.current).toBe('b');
  });
});
