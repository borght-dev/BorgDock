import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WALK_ORDER } from '@/services/dispatch/walk';
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
      slots={scene.overview.slots}
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

  it('selects an item from the overview grid', () => {
    const { onSelect } = renderWalk();
    const grid = screen.getByRole('region', { name: 'Overview' });
    fireEvent.click(within(grid).getByRole('button', { name: '60233' }));
    expect(onSelect).toHaveBeenCalledWith(60233);
  });

  it('shows the open item in the drawer', () => {
    renderWalk(60240);
    expect(screen.getByRole('complementary', { name: 'Work item' })).toBeInTheDocument();
  });
});
