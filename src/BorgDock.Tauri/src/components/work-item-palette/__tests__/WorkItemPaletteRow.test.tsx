import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkItemPaletteRow } from '../WorkItemPaletteRow';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

function makeItem(overrides: Partial<ResultItem> = {}): ResultItem {
  return {
    id: 54519,
    title: 'Quotes: success toast appears even on failure',
    state: 'Testing Failed',
    workItemType: 'Bug',
    assignedTo: 'Koen van der Borght',
    priority: 2,
    commentCount: 3,
    iteration: 'R5.2.7.5',
    ...overrides,
  };
}

describe('WorkItemPaletteRow', () => {
  it('renders #id, title, and state pill', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem()}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('#54519')).toBeInTheDocument();
    expect(screen.getByText(/success toast/)).toBeInTheDocument();
    expect(screen.getByText('Testing Failed')).toBeInTheDocument();
  });

  it('shows comment count when > 0', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem({ commentCount: 7 })}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('hides comment count when missing', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem({ commentCount: undefined })}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Comments')).toBeNull();
  });

  it('fires onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <WorkItemPaletteRow
        item={makeItem()}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={onSelect}
      />,
    );
    fireEvent.mouseDown(screen.getByText(/success toast/));
    expect(onSelect).toHaveBeenCalledWith(54519);
  });
});
