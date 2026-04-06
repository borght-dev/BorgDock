import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkItemFilterBar } from '../WorkItemFilterBar';

function defaultProps() {
  return {
    states: ['Active', 'New', 'Resolved'],
    assignees: ['Alice', 'Bob'],
    selectedState: 'All',
    selectedAssignee: 'Anyone',
    trackingFilter: 'all' as const,
    trackedCount: 0,
    workingOnCount: 0,
    onStateChange: vi.fn(),
    onAssigneeChange: vi.fn(),
    onTrackingFilterChange: vi.fn(),
    onRefresh: vi.fn(),
    onOpenQueryBrowser: vi.fn(),
    selectedQueryName: undefined as string | undefined,
  };
}

describe('WorkItemFilterBar', () => {
  afterEach(cleanup);

  it('shows "Select a query..." when no query selected', () => {
    render(<WorkItemFilterBar {...defaultProps()} />);
    expect(screen.getByText('Select a query...')).toBeDefined();
  });

  it('shows selected query name', () => {
    const props = defaultProps();
    props.selectedQueryName = 'Active Bugs';
    render(<WorkItemFilterBar {...props} />);
    expect(screen.getByText('Active Bugs')).toBeDefined();
  });

  it('calls onOpenQueryBrowser when query button clicked', () => {
    const props = defaultProps();
    props.selectedQueryName = 'My Query';
    render(<WorkItemFilterBar {...props} />);
    fireEvent.click(screen.getByText('My Query'));
    expect(props.onOpenQueryBrowser).toHaveBeenCalled();
  });

  it('calls onRefresh when refresh button clicked', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);
    fireEvent.click(screen.getByTitle('Refresh'));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('renders state filter options', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);

    const stateSelect = screen.getAllByRole('combobox')[0]!;
    const options = stateSelect.querySelectorAll('option');
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain('All states');
    expect(optionTexts).toContain('Active');
    expect(optionTexts).toContain('New');
    expect(optionTexts).toContain('Resolved');
  });

  it('calls onStateChange when state filter changes', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);

    const stateSelect = screen.getAllByRole('combobox')[0]!;
    fireEvent.change(stateSelect, { target: { value: 'Active' } });
    expect(props.onStateChange).toHaveBeenCalledWith('Active');
  });

  it('renders assignee filter options', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);

    const assigneeSelect = screen.getAllByRole('combobox')[1]!;
    const options = assigneeSelect.querySelectorAll('option');
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain('Anyone');
    expect(optionTexts).toContain('@Me');
    expect(optionTexts).toContain('Alice');
    expect(optionTexts).toContain('Bob');
  });

  it('calls onAssigneeChange when assignee filter changes', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);

    const assigneeSelect = screen.getAllByRole('combobox')[1]!;
    fireEvent.change(assigneeSelect, { target: { value: 'Alice' } });
    expect(props.onAssigneeChange).toHaveBeenCalledWith('Alice');
  });

  it('renders tracking filter pills', () => {
    render(<WorkItemFilterBar {...defaultProps()} />);
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Tracked')).toBeDefined();
    expect(screen.getByText('Working')).toBeDefined();
  });

  it('calls onTrackingFilterChange with "tracked" when Tracked pill clicked', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);
    fireEvent.click(screen.getByText('Tracked'));
    expect(props.onTrackingFilterChange).toHaveBeenCalledWith('tracked');
  });

  it('calls onTrackingFilterChange with "workingOn" when Working pill clicked', () => {
    const props = defaultProps();
    render(<WorkItemFilterBar {...props} />);
    fireEvent.click(screen.getByText('Working'));
    expect(props.onTrackingFilterChange).toHaveBeenCalledWith('workingOn');
  });

  it('calls onTrackingFilterChange with "all" when All pill clicked', () => {
    const props = defaultProps();
    props.trackingFilter = 'tracked';
    render(<WorkItemFilterBar {...props} />);
    fireEvent.click(screen.getByText('All'));
    expect(props.onTrackingFilterChange).toHaveBeenCalledWith('all');
  });

  it('shows tracked count when > 0', () => {
    const props = defaultProps();
    props.trackedCount = 5;
    render(<WorkItemFilterBar {...props} />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('shows working-on count when > 0', () => {
    const props = defaultProps();
    props.workingOnCount = 3;
    render(<WorkItemFilterBar {...props} />);
    expect(screen.getByText('3')).toBeDefined();
  });

  it('does not show counts when 0', () => {
    const props = defaultProps();
    props.trackedCount = 0;
    props.workingOnCount = 0;
    render(<WorkItemFilterBar {...props} />);
    // Only "All", "Tracked", "Working" text, no numbers
    expect(screen.queryByText('0')).toBeNull();
  });
});
