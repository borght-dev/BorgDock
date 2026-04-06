import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkItemCardData } from '../WorkItemCard';
import { WorkItemList } from '../WorkItemList';

function makeItem(id: number, overrides: Partial<WorkItemCardData> = {}): WorkItemCardData {
  return {
    id,
    title: `Work item ${id}`,
    state: 'Active',
    workItemType: 'Task',
    assignedTo: 'Bob',
    priority: 3,
    tags: '',
    age: '1d',
    htmlUrl: `https://dev.azure.com/org/proj/_workitems/edit/${id}`,
    isTracked: false,
    isWorkingOn: false,
    isSelected: false,
    ...overrides,
  };
}

const baseProps = {
  worktrees: [],
  onSelect: vi.fn(),
  onToggleTracked: vi.fn(),
  onToggleWorkingOn: vi.fn(),
  onAssignWorktree: vi.fn(),
  onOpenInBrowser: vi.fn(),
};

describe('WorkItemList', () => {
  afterEach(cleanup);

  it('shows loading spinner when isLoading', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[]}
        isLoading={true}
        isEmpty={false}
        selectedQueryName="My Query"
      />,
    );
    expect(screen.getByText('Loading work items...')).toBeDefined();
  });

  it('shows "Select a saved query" when no selectedQueryName', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[]}
        isLoading={false}
        isEmpty={false}
        selectedQueryName={undefined}
      />,
    );
    expect(screen.getByText('Select a saved query to load work items')).toBeDefined();
  });

  it('shows empty message when isEmpty is true', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[]}
        isLoading={false}
        isEmpty={true}
        selectedQueryName="Active Bugs"
      />,
    );
    expect(screen.getByText('No work items match the current filters')).toBeDefined();
  });

  it('renders a list of work item cards', () => {
    const items = [makeItem(1), makeItem(2), makeItem(3)];
    render(
      <WorkItemList
        {...baseProps}
        items={items}
        isLoading={false}
        isEmpty={false}
        selectedQueryName="All Items"
      />,
    );
    expect(screen.getByText('Work item 1')).toBeDefined();
    expect(screen.getByText('Work item 2')).toBeDefined();
    expect(screen.getByText('Work item 3')).toBeDefined();
  });

  it('renders correct number of items', () => {
    const items = [makeItem(10), makeItem(20)];
    render(
      <WorkItemList
        {...baseProps}
        items={items}
        isLoading={false}
        isEmpty={false}
        selectedQueryName="My Query"
      />,
    );
    expect(screen.getByText('#10')).toBeDefined();
    expect(screen.getByText('#20')).toBeDefined();
  });

  it('does not show loading message when not loading', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[makeItem(1)]}
        isLoading={false}
        isEmpty={false}
        selectedQueryName="My Query"
      />,
    );
    expect(screen.queryByText('Loading work items...')).toBeNull();
  });

  it('prefers loading state over empty state', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[]}
        isLoading={true}
        isEmpty={true}
        selectedQueryName="My Query"
      />,
    );
    expect(screen.getByText('Loading work items...')).toBeDefined();
    expect(screen.queryByText('No work items match the current filters')).toBeNull();
  });

  it('prefers no-query state over empty state', () => {
    render(
      <WorkItemList
        {...baseProps}
        items={[]}
        isLoading={false}
        isEmpty={true}
        selectedQueryName={undefined}
      />,
    );
    expect(screen.getByText('Select a saved query to load work items')).toBeDefined();
    expect(screen.queryByText('No work items match the current filters')).toBeNull();
  });
});
