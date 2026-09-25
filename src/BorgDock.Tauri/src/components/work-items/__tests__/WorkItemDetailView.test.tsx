import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ado = vi.hoisted(() => ({
  getWorkItem: vi.fn(),
  getWorkItemComments: vi.fn(),
  getWorkItemTypeStates: vi.fn(),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

vi.mock('@/services/ado/workitems', () => ado);
vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(function MockAdoClient() {
    return { get: vi.fn(), getStream: vi.fn() };
  }),
}));
vi.mock('@/services/ado/fields', () => ({
  getProjectFields: vi.fn().mockResolvedValue([]),
  indexFieldsByRef: vi.fn(() => new Map()),
}));
vi.mock('@/services/ado/layout', () => ({
  getProjectProcessId: vi.fn().mockResolvedValue(null),
  getProcessWitTypeRefs: vi.fn().mockResolvedValue(new Map()),
  getProcessLayout: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useAdoImageAuth', () => ({ useAdoImageAuth: vi.fn() }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequest, PullRequestWithChecks, WorkItem } from '@/types';
import { mentionsWorkItem } from '../WorkItemDetailPanel/LinksTab';
import { WorkItemDetailView } from '../WorkItemDetailView';

const settingsBefore = useSettingsStore.getState().settings;

function makeItem(id: number): WorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/org/proj/_apis/wit/workItems/${id}`,
    fields: {
      'System.Title': 'Quote footer broken',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Alice' },
      'System.Tags': '',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.IterationPath': 'Proj\\Sprint 7',
      'System.Description': '<p>Steps</p>',
    },
    relations: [],
    htmlUrl: `https://dev.azure.com/org/proj/_workitems/edit/${id}`,
  };
}

const mentioning = {
  pullRequest: {
    number: 311,
    title: 'Fix the quote footer (AB#54482)',
    body: '',
    headRef: 'fix/footer',
    labels: [],
    repoOwner: 'acme',
    repoName: 'app',
    state: 'open',
  },
} as unknown as PullRequestWithChecks;

describe('WorkItemDetailView', () => {
  beforeEach(() => {
    for (const fn of Object.values(ado)) fn.mockReset();
    ado.getWorkItem.mockResolvedValue(makeItem(54482));
    ado.getWorkItemComments.mockResolvedValue([]);
    ado.getWorkItemTypeStates.mockResolvedValue(['New', 'Active', 'Resolved']);
    useSettingsStore.setState({
      settings: {
        ...settingsBefore,
        ui: { ...settingsBefore.ui },
        azureDevOps: {
          ...settingsBefore.azureDevOps,
          organization: 'org',
          project: 'proj',
          personalAccessToken: 'pat',
          authMethod: 'pat',
        },
      },
    });
    useWorkItemsStore.setState({
      workItems: [makeItem(54482)],
      trackedWorkItemIds: new Set(),
      workingOnWorkItemIds: new Set(),
    });
    usePrStore.setState({ pullRequests: [mentioning], closedPullRequests: [] });
    useUiStore.setState({
      viewStack: [{ kind: 'list' }, { kind: 'work-item-detail', id: 54482 }],
      activeSection: 'workitems',
    });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: settingsBefore });
    useWorkItemsStore.setState({ workItems: [] });
    usePrStore.setState({ pullRequests: [] });
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
  });

  it('shows a listed item at once in the reading-font host with the Workbench header', () => {
    const { container } = render(<WorkItemDetailView id={54482} />);
    const article = screen.getByRole('article', { name: 'Work item AB#54482' });
    expect(article).toHaveClass('bd-detail');
    expect(within(article).getByText('AB#54482')).toBeInTheDocument();
    // The type pill in the header (the rail names the type again).
    expect(article.querySelector('.bd-wi-type')).toHaveAttribute('data-type-tone', 'bug');
    expect(article.querySelector('.bd-wi-type')).toHaveTextContent('Bug');
    expect(within(article).getByText('Active, P2')).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Quote footer broken' });
    // The row's title morphs into this heading.
    expect(h1.style.viewTransitionName).toBe('wi-title-54482');
    // The title block of the pop-out is replaced, not stacked.
    expect(screen.queryByText('copy ID')).not.toBeInTheDocument();
    expect(container.querySelector('.bd-detail__spinner')).not.toBeInTheDocument();
  });

  it('Back pops the view stack', async () => {
    render(<WorkItemDetailView id={54482} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]));
  });

  it('tabs switch by click and by J / K, with the sliding underline', async () => {
    const { container } = render(<WorkItemDetailView id={54482} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('bd-tabs--sliding');
    const selected = () =>
      within(tablist)
        .getAllByRole('tab')
        .find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
    expect(selected()).toMatch(/^Overview|^Details/);

    fireEvent.click(within(tablist).getByRole('tab', { name: /Links/ }));
    expect(selected()).toMatch(/^Links/);
    // The pane is keyed by tab, so each switch mounts a fresh (fading) pane.
    expect(container.querySelector('.bd-wi-detail__pane')).toHaveClass('bd-detail__pane');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(selected()).toMatch(/^Attachments/);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(selected()).toMatch(/^Links/);
  });

  it('Links lists the pull requests that mention the item and opens one in place', async () => {
    render(<WorkItemDetailView id={54482} />);
    fireEvent.click(screen.getByRole('tab', { name: /Links/ }));
    const link = screen.getByRole('button', { name: /Fix the quote footer/ });
    fireEvent.click(link);
    await waitFor(() =>
      expect(useUiStore.getState().viewStack.slice(-1)[0]).toEqual({
        kind: 'pr-detail',
        owner: 'acme',
        repo: 'app',
        number: 311,
      }),
    );
    // Back from the PR returns to this work item, in Work items.
    expect(useUiStore.getState().viewStack[1]).toEqual({ kind: 'work-item-detail', id: 54482 });
    expect(useUiStore.getState().activeSection).toBe('workitems');
  });

  it('Links ignores a plain #NNN: only AB#<id> links a pull request', () => {
    const plain = {
      pullRequest: {
        ...mentioning.pullRequest,
        number: 312,
        title: 'Fix crash (#54482)',
        headRef: 'fix/54482',
      },
    } as unknown as PullRequestWithChecks;
    usePrStore.setState({ pullRequests: [mentioning, plain] });
    render(<WorkItemDetailView id={54482} />);
    fireEvent.click(screen.getByRole('tab', { name: /Links/ }));
    expect(screen.getByRole('button', { name: /Fix the quote footer/ })).toBeInTheDocument();
    expect(screen.queryByText('Fix crash (#54482)')).not.toBeInTheDocument();
  });

  it('matches AB#<id> case-insensitively and only the exact id', () => {
    const pr = (title: string) =>
      ({ title, body: '', headRef: 'x', labels: [] }) as unknown as PullRequest;
    expect(mentionsWorkItem(pr('ab#1234: fix'), 1234)).toBe(true);
    expect(mentionsWorkItem(pr('Fix crash (#1234)'), 1234)).toBe(false);
    expect(mentionsWorkItem(pr('AB#12345'), 1234)).toBe(false);
    expect(mentionsWorkItem(pr('AB#999 and AB#1234'), 1234)).toBe(true);
  });

  it('the action bar toggles Track and Working', () => {
    render(<WorkItemDetailView id={54482} />);
    const track = screen.getByRole('button', { name: 'Track' });
    fireEvent.click(track);
    expect(useWorkItemsStore.getState().trackedWorkItemIds.has(54482)).toBe(true);
    expect(screen.getByRole('button', { name: 'Tracked' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Start working' }));
    expect(useWorkItemsStore.getState().workingOnWorkItemIds.has(54482)).toBe(true);
    expect(screen.getByRole('button', { name: 'Open in ADO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy id' })).toBeInTheDocument();
  });

  it('an item outside the list loads behind a header with Back and the id', async () => {
    useWorkItemsStore.setState({ workItems: [] });
    let resolve: (item: WorkItem) => void = () => {};
    ado.getWorkItem.mockReturnValue(
      new Promise<WorkItem>((r) => {
        resolve = r;
      }),
    );
    render(<WorkItemDetailView id={54482} />);
    expect(screen.getByRole('heading', { level: 1, name: 'AB#54482' })).toBeInTheDocument();
    expect(screen.getByLabelText('Loading work item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    await act(async () => resolve(makeItem(54482)));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quote footer broken' }),
    ).toBeInTheDocument();
  });
});
