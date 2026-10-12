import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { DispatchBoard } from '../DispatchBoard';
import { DISPATCH_ITEM_MIME } from '../SlotStrip';
import type { DispatchActions } from '../unit-actions';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function spyActions(): DispatchActions {
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

function renderBoard(openId: number | null = null) {
  const scene = makeDispatchScene(NOW);
  const actions = spyActions();
  const onSelect = vi.fn();
  render(
    <DispatchBoard
      items={scene.overview.items}
      slots={scene.overview.slots}
      openId={openId}
      now={NOW}
      busy={false}
      actions={actions}
      onSelect={onSelect}
    />,
  );
  return { scene, actions, onSelect };
}

const column = (name: string) => screen.getByRole('region', { name });

describe('DispatchBoard', () => {
  it('sorts the items into its four columns and the lane', () => {
    renderBoard();

    expect(within(column('Needs you')).getAllByRole('article')).toHaveLength(6);
    expect(within(column('Agents working')).getAllByRole('article')).toHaveLength(2);
    expect(within(column('Up next')).getAllByRole('article')).toHaveLength(2);
    expect(within(column('Not started')).getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Paused 1')).toBeInTheDocument();
    expect(screen.getByText('Handed off 1')).toBeInTheDocument();
  });

  it('shows the question on the card and answers it with the recommended option', () => {
    const { scene, actions } = renderBoard();
    const card = within(column('Needs you')).getAllByRole('article')[0] as HTMLElement;

    expect(
      within(card).getByText(/restore the position by row id or by pixel offset/),
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Restore by row id' }));

    expect(actions.answer).toHaveBeenCalledWith(
      scene.threads.find((t) => t.id === 't-60214'),
      { restore: 'Restore by row id (Recommended)' },
    );
  });

  it('keeps a card to two buttons with short labels', () => {
    renderBoard();
    const queued = within(column('Up next')).getAllByRole('article')[0] as HTMLElement;
    const buttons = within(queued)
      .getAllByRole('button')
      .filter((b) => b.dataset.dpAction);
    expect(buttons.map((b) => b.textContent)).toEqual(['Start in T3', 'Remove']);
  });

  it('opens the launch sheet from a card', () => {
    const { scene, actions } = renderBoard();
    const card = within(column('Not started')).getAllByRole('article')[0] as HTMLElement;

    fireEvent.click(within(card).getByRole('button', { name: 'Start in T3' }));

    expect(actions.start).toHaveBeenCalledWith(scene.items.find((i) => i.id === 60201));
  });

  it('opens a card in the drawer and closes it again', () => {
    const { onSelect } = renderBoard(59877);

    const drawer = screen.getByRole('complementary', { name: 'Work item' });
    expect(within(drawer).getByRole('article')).toHaveAccessibleName(
      'Show technician availability on the planning board',
    );
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('selects a card when its body is clicked', () => {
    const { onSelect } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /^Upgrade the report renderer, AB#60150/ }));
    expect(onSelect).toHaveBeenCalledWith(60150);
  });

  it('lets only an item without a running agent be dragged, carrying its id', () => {
    renderBoard();
    const running = within(column('Agents working')).getAllByRole('article')[0] as HTMLElement;
    const idle = within(column('Not started')).getAllByRole('article')[0] as HTMLElement;
    expect(running).toHaveAttribute('draggable', 'false');
    expect(idle).toHaveAttribute('draggable', 'true');

    const setData = vi.fn();
    fireEvent.dragStart(idle, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(DISPATCH_ITEM_MIME, '60201');
  });
});
