import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WALK_ORDER } from '@/services/dispatch/walk';
import { useDispatchStore } from '@/stores/dispatch-store';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { DispatchWalk } from '../DispatchWalk';
import type { DispatchActions } from '../unit-actions';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function makeActions(): DispatchActions {
  return {
    answer: vi.fn(),
    approvePlan: vi.fn(),
    settle: vi.fn(),
    openInT3: vi.fn(),
    move: vi.fn(),
    hideSuggestion: vi.fn(),
    start: vi.fn(),
    queue: vi.fn(),
    unqueue: vi.fn(),
    openInAdo: vi.fn(),
    openPullRequest: vi.fn(),
  };
}

function renderWalk(openId: number | null = null) {
  const scene = makeDispatchScene(NOW);
  const actions = makeActions();
  const onSelect = vi.fn();
  render(
    <DispatchWalk
      items={scene.overview.items}
      openId={openId}
      now={NOW}
      busy={false}
      actions={actions}
      onSelect={onSelect}
      onOpen={vi.fn()}
    />,
  );
  return { actions, onSelect };
}

function lane(state: string): HTMLElement {
  return screen.getByRole('region', { name: state });
}

describe('DispatchWalk', () => {
  beforeEach(() => {
    useDispatchStore.setState({ briefFilter: null, runs: [] });
  });

  it('walks the states in order, the empty ones too, then the rest', () => {
    renderWalk();
    const lanes = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((name) => name !== 'Overview');
    expect(lanes.slice(0, WALK_ORDER.length)).toEqual(WALK_ORDER);
    expect(lanes).toContain('Ready For QA');
  });

  it('says what each item needs and why', () => {
    renderWalk();
    const review = lane('Code Review');
    expect(within(review).getByText('Ready to merge')).toBeInTheDocument();
    expect(within(review).getByText('#3731 · approved · green')).toBeInTheDocument();
    expect(within(review).getByText('CI red')).toBeInTheDocument();
  });

  it('quotes what Vera asks on an item that waits on you', () => {
    renderWalk();
    const quote = within(lane('Needs Human')).getByText(/I need your decision on two classes/);
    expect(quote.closest('blockquote')).not.toBeNull();
  });

  it('moves an item to any state of its workflow, Done included', () => {
    const { actions } = renderWalk();
    const row = within(lane('Code Review')).getByRole('button', { name: /AB#60245/ });
    fireEvent.click(within(row).getByRole('button', { name: /^State: Code Review/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
    expect(actions.move).toHaveBeenCalledWith(expect.objectContaining({ id: 60245 }), 'Done');
  });

  it('opens the pull request that is ready to merge', () => {
    const { actions } = renderWalk();
    fireEvent.click(screen.getByRole('button', { name: 'Open #3731' }));
    expect(actions.openPullRequest).toHaveBeenCalledWith(expect.objectContaining({ number: 3731 }));
  });

  it('selects an item from the overview', () => {
    const { onSelect } = renderWalk();
    const overview = screen.getByRole('region', { name: 'Overview' });
    fireEvent.click(within(overview).getByRole('button', { name: /^60233 / }));
    expect(onSelect).toHaveBeenCalledWith(60233);
  });

  it('leads the overview with what needs you and what is out of sync', () => {
    renderWalk();
    const overview = screen.getByRole('region', { name: 'Overview' });
    expect(within(overview).getByText('need you')).toBeInTheDocument();
    expect(within(overview).getByText('out of sync')).toBeInTheDocument();
    expect(within(overview).getByText('fine')).toBeInTheDocument();
  });

  it('scrolls to a lane from its name in the overview', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderWalk();
    const overview = screen.getByRole('region', { name: 'Overview' });
    fireEvent.click(within(overview).getByRole('button', { name: /^Code Review/ }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('shows the open item in the drawer', () => {
    renderWalk(60240);
    expect(screen.getByRole('complementary', { name: 'Work item' })).toBeInTheDocument();
  });

  it('narrows the lanes to what a count counts, folds the empty ones, and clears', () => {
    renderWalk();
    const overview = screen.getByRole('region', { name: 'Overview' });
    const shownIds = () =>
      [...document.querySelectorAll('.bd-dp-wlane [data-dp-id]')].map((row) =>
        Number(row.getAttribute('data-dp-id')),
      );

    fireEvent.click(within(overview).getByRole('button', { name: /out of sync/ }));

    expect(shownIds().sort()).toEqual([59403, 60102]);
    expect(within(lane('Code Review')).getByText('1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Needs Human' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/^Nothing out of sync in Testing Failed · Needs Human · New/),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Showing\s*2 out of sync\s*of 20 items/);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(shownIds()).toHaveLength(20);
  });

  it('toggles a count off with a second click', () => {
    renderWalk();
    const overview = screen.getByRole('region', { name: 'Overview' });
    const fine = within(overview).getByRole('button', { name: /fine/ });
    fireEvent.click(fine);
    expect(fine).toHaveAttribute('aria-pressed', 'true');
    expect(useDispatchStore.getState().briefFilter).toBe('fine');
    fireEvent.click(fine);
    expect(useDispatchStore.getState().briefFilter).toBeNull();
  });
});
