import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkItemRow, type WorkItemRowData } from '../WorkItemRow';

const w: WorkItemRowData = {
  id: 54482,
  type: 'Bug',
  title: 'Quote footer broken',
  state: 'Active',
  priority: 2,
  isWorking: true,
  isTracked: false,
};

describe('WorkItemRow', () => {
  it('renders type pill, id, title, meta, working pill', () => {
    render(
      <WorkItemRow
        item={w}
        selected={false}
        onClick={() => {}}
        onToggleTracked={() => {}}
        onToggleWorking={() => {}}
      />,
    );
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('AB#54482')).toBeInTheDocument();
    expect(screen.getByText('Quote footer broken')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <WorkItemRow
        item={w}
        selected={false}
        onClick={onClick}
        onToggleTracked={() => {}}
        onToggleWorking={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Quote footer broken'));
    expect(onClick).toHaveBeenCalled();
  });

  it('does not show "working" pill when isWorking is false', () => {
    render(
      <WorkItemRow
        item={{ ...w, isWorking: false }}
        selected={false}
        onClick={() => {}}
        onToggleTracked={() => {}}
        onToggleWorking={() => {}}
      />,
    );
    expect(screen.queryByText('working')).toBeNull();
  });

  it('toggle buttons stop propagation and call their handlers', () => {
    const onClick = vi.fn();
    const onToggleTracked = vi.fn();
    const onToggleWorking = vi.fn();
    render(
      <WorkItemRow
        item={w}
        selected={false}
        onClick={onClick}
        onToggleTracked={onToggleTracked}
        onToggleWorking={onToggleWorking}
      />,
    );
    fireEvent.click(screen.getByLabelText('Track'));
    expect(onToggleTracked).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Stop working on'));
    expect(onToggleWorking).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
