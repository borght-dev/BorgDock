import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { useUiStore } from '@/stores/ui-store';
import { WorkItemRow, type WorkItemRowData } from '../WorkItemRow';

const bug: WorkItemRowData = {
  id: 54482,
  type: 'Bug',
  title: 'Quote footer broken',
  state: 'Active',
  priority: 2,
  isWorking: false,
  isTracked: false,
};

function row(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.bd-wi-wb-row')!;
}

describe('WorkItemRow', () => {
  beforeEach(() => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }], workItemsSelectedId: null });
  });
  afterEach(() => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }], workItemsSelectedId: null });
  });

  it('draws type pill, AB#id in the UI font, title and the state line', () => {
    const { container } = render(<WorkItemRow item={bug} selected={false} />);
    const id = screen.getByText('AB#54482');
    expect(id).toHaveClass('bd-wi-wb-row__id');
    expect(id).not.toHaveClass('bd-mono');
    expect(screen.getByText('Quote footer broken')).toHaveClass('bd-wb-row__title');
    expect(screen.getByText('Active, P2')).toBeInTheDocument();
    expect(row(container)).toHaveAttribute('data-wi-id', '54482');
    // flip() follows the wrapper by `wi-<id>`.
    expect(container.querySelector('[data-key="wi-54482"]')).toHaveClass('bd-wb-rowwrap');
  });

  it.each([
    ['Bug', 'Bug', 'bug'],
    ['Task', 'Task', 'task'],
    ['User Story', 'Story', 'neutral'],
    ['Product Backlog Item', 'PBI', 'neutral'],
    ['Feature', 'Feature', 'neutral'],
  ])('a %s gets the "%s" pill in the %s tone', (type, label, tone) => {
    render(<WorkItemRow item={{ ...bug, type }} selected={false} />);
    expect(screen.getByText(label)).toHaveAttribute('data-type-tone', tone);
  });

  it('omits the priority from the state line when there is none', () => {
    render(<WorkItemRow item={{ ...bug, priority: undefined }} selected={false} />);
    expect(screen.getByText('Active')).toHaveClass('bd-wi-wb-row__state');
  });

  it('comfortable is the 42 px row, compact the 32 px one', () => {
    const { container, rerender } = render(<WorkItemRow item={bug} selected={false} />);
    expect(row(container)).toHaveClass('bd-wb-row', 'bd-wb-row--comfortable');
    rerender(<WorkItemRow item={bug} selected={false} density="compact" />);
    expect(row(container)).toHaveClass('bd-wb-row--compact');
    expect(row(container)).toHaveAttribute('data-density', 'compact');
    // Compact keeps the state line (on the title's line).
    expect(screen.getByText('Active, P2')).toBeInTheDocument();
  });

  it('the selected row carries the selection bar and the title transition name', () => {
    const { container } = render(<WorkItemRow item={bug} selected />);
    expect(row(container)).toHaveAttribute('data-selected', 'true');
    expect(row(container)).toHaveAttribute('aria-current', 'true');
    expect(row(container).style.getPropertyValue('--bd-vt-title')).toBe('wi-title-54482');
    expect(container.querySelector('.bd-wb-rowwrap')).toHaveAttribute('data-selected', 'true');
  });

  it('shows the tracked and working state on the toggles', () => {
    const { container } = render(
      <WorkItemRow item={{ ...bug, isTracked: true, isWorking: true }} selected={false} />,
    );
    const track = screen.getByRole('button', { name: 'Untrack AB#54482' });
    const working = screen.getByRole('button', { name: 'Stop working on AB#54482' });
    expect(track).toHaveAttribute('aria-pressed', 'true');
    expect(track).toHaveAttribute('data-on', 'true');
    expect(working).toHaveAttribute('aria-pressed', 'true');
    expect(row(container)).toHaveAttribute('data-tracked', 'true');
    expect(row(container)).toHaveAttribute('data-working', 'true');
  });

  it('the toggles are not inside the row button and do not open the item', () => {
    const onOpen = vi.fn();
    const onToggleTracked = vi.fn();
    const onToggleWorking = vi.fn();
    const { container } = render(
      <WorkItemRow
        item={bug}
        selected={false}
        onOpen={onOpen}
        onToggleTracked={onToggleTracked}
        onToggleWorking={onToggleWorking}
      />,
    );
    const track = screen.getByRole('button', { name: 'Track AB#54482' });
    expect(row(container).contains(track)).toBe(false);
    fireEvent.click(track);
    fireEvent.click(screen.getByRole('button', { name: 'Start working on AB#54482' }));
    expect(onToggleTracked).toHaveBeenCalledWith(54482);
    expect(onToggleWorking).toHaveBeenCalledWith(54482);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('click selects the row and pushes the work item detail view', async () => {
    const { container } = render(<WorkItemRow item={bug} selected={false} />);
    fireEvent.click(row(container));
    await waitFor(() =>
      expect(useUiStore.getState().viewStack).toEqual([
        { kind: 'list' },
        { kind: 'work-item-detail', id: 54482 },
      ]),
    );
    expect(useUiStore.getState().workItemsSelectedId).toBe(54482);
  });

  it('Enter and Space on the focused row open it; Ctrl+click opens in place too', () => {
    const onOpen = vi.fn();
    const { container } = render(<WorkItemRow item={bug} selected={false} onOpen={onOpen} />);
    fireEvent.keyDown(row(container), { key: 'Enter' });
    fireEvent.keyDown(row(container), { key: ' ' });
    fireEvent.click(row(container), { ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenCalledWith(54482);
  });
});
