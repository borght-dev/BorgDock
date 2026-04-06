import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkItemCard, type WorkItemCardData } from '../WorkItemCard';

// ---------- helpers ----------

function makeCard(overrides: Partial<WorkItemCardData> = {}): WorkItemCardData {
  return {
    id: 42,
    title: 'Fix login bug',
    state: 'Active',
    workItemType: 'Bug',
    assignedTo: 'Alice',
    priority: 2,
    tags: 'frontend; auth',
    age: '3d',
    htmlUrl: 'https://dev.azure.com/org/proj/_workitems/edit/42',
    isTracked: false,
    isWorkingOn: false,
    isSelected: false,
    ...overrides,
  };
}

function defaultProps(overrides: Partial<WorkItemCardData> = {}) {
  return {
    item: makeCard(overrides),
    worktrees: [],
    onSelect: vi.fn(),
    onToggleTracked: vi.fn(),
    onToggleWorkingOn: vi.fn(),
    onAssignWorktree: vi.fn(),
    onOpenInBrowser: vi.fn(),
  };
}

// ---------- tests ----------

describe('WorkItemCard', () => {
  afterEach(cleanup);

  it('renders title, id, work item type and assignee', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    expect(screen.getByText('Fix login bug')).toBeDefined();
    expect(screen.getByText('#42')).toBeDefined();
    expect(screen.getByText('Bug')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('displays type letter abbreviation for known types', () => {
    const props = defaultProps({ workItemType: 'Bug' });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText('B')).toBeDefined();
  });

  it('displays "?" for unknown work item types', () => {
    const props = defaultProps({ workItemType: 'Incident' });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText('?')).toBeDefined();
  });

  it.each([
    ['Bug', 'B'],
    ['Task', 'T'],
    ['Feature', 'F'],
    ['Epic', 'E'],
    ['User Story', 'U'],
  ])('maps type "%s" to letter "%s"', (type, letter) => {
    const props = defaultProps({ workItemType: type });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText(letter)).toBeDefined();
    cleanup();
  });

  it('renders state badge text', () => {
    const props = defaultProps({ state: 'Resolved' });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText('Resolved')).toBeDefined();
  });

  it('renders age when present', () => {
    const props = defaultProps({ age: '5h' });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText('5h')).toBeDefined();
  });

  it('renders priority icon for priority 1', () => {
    const props = defaultProps({ priority: 1 });
    render(<WorkItemCard {...props} />);
    expect(screen.getByTitle('Critical')).toBeDefined();
  });

  it('renders priority icon for priority 4', () => {
    const props = defaultProps({ priority: 4 });
    render(<WorkItemCard {...props} />);
    expect(screen.getByTitle('Low')).toBeDefined();
  });

  it('does not render priority icon when undefined', () => {
    const props = defaultProps({ priority: undefined });
    render(<WorkItemCard {...props} />);
    expect(screen.queryByTitle('Critical')).toBeNull();
    expect(screen.queryByTitle('High')).toBeNull();
  });

  it('calls onSelect with item id when card is clicked', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.click(screen.getByText('Fix login bug'));
    expect(props.onSelect).toHaveBeenCalledWith(42);
  });

  it('calls onToggleTracked on tracked button click and stops propagation', () => {
    const props = defaultProps({ isTracked: false });
    render(<WorkItemCard {...props} />);

    const btn = screen.getByTitle('Track this item');
    fireEvent.click(btn);
    expect(props.onToggleTracked).toHaveBeenCalledWith(42);
    // onSelect should NOT have been called (event stopped)
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('shows "Stop tracking" title when isTracked', () => {
    const props = defaultProps({ isTracked: true });
    render(<WorkItemCard {...props} />);
    expect(screen.getByTitle('Stop tracking')).toBeDefined();
  });

  it('calls onToggleWorkingOn on working-on button click and stops propagation', () => {
    const props = defaultProps({ isWorkingOn: false });
    render(<WorkItemCard {...props} />);

    const btn = screen.getByTitle('Mark as working on');
    fireEvent.click(btn);
    expect(props.onToggleWorkingOn).toHaveBeenCalledWith(42);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('shows "Stop working on" title when isWorkingOn', () => {
    const props = defaultProps({ isWorkingOn: true });
    render(<WorkItemCard {...props} />);
    expect(screen.getByTitle('Stop working on')).toBeDefined();
  });

  it('shows worktree path when isWorkingOn and worktreePath set', () => {
    const props = defaultProps({
      isWorkingOn: true,
      worktreePath: '/repos/my-branch',
    });
    render(<WorkItemCard {...props} />);
    expect(screen.getByText('/repos/my-branch')).toBeDefined();
  });

  it('does not show worktree path when isWorkingOn is false', () => {
    const props = defaultProps({
      isWorkingOn: false,
      worktreePath: '/repos/my-branch',
    });
    render(<WorkItemCard {...props} />);
    expect(screen.queryByText('/repos/my-branch')).toBeNull();
  });

  it('does not show assignee when empty', () => {
    const props = defaultProps({ assignedTo: '' });
    render(<WorkItemCard {...props} />);
    // Only id + type shown, not an extra separator for empty assignee
    expect(screen.queryByText('Alice')).toBeNull();
  });

  // ---- Context menu ----

  it('opens context menu on right click', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    expect(screen.getByText('Track this item')).toBeDefined();
    expect(screen.getByText('Open in browser')).toBeDefined();
  });

  it('context menu track button calls onToggleTracked', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    fireEvent.click(screen.getByText('Track this item'));
    expect(props.onToggleTracked).toHaveBeenCalledWith(42);
  });

  it('context menu shows "Stop tracking" when already tracked', () => {
    const props = defaultProps({ isTracked: true });
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    expect(screen.getByText('Stop tracking')).toBeDefined();
  });

  it('context menu working-on button calls onToggleWorkingOn', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    fireEvent.click(screen.getByText('Mark as working on'));
    expect(props.onToggleWorkingOn).toHaveBeenCalledWith(42);
  });

  it('context menu open in browser calls onOpenInBrowser', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    fireEvent.click(screen.getByText('Open in browser'));
    expect(props.onOpenInBrowser).toHaveBeenCalledWith(
      'https://dev.azure.com/org/proj/_workitems/edit/42',
    );
  });

  it('context menu shows worktree options when worktrees provided', () => {
    const props = {
      ...defaultProps(),
      worktrees: [
        { path: '/repos/main', branchName: 'main', isMainWorktree: true },
        { path: '/repos/feature', branchName: 'feature/x', isMainWorktree: false },
      ],
    };
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    expect(screen.getByText('Set worktree')).toBeDefined();
    expect(screen.getByText('main')).toBeDefined();
    expect(screen.getByText('feature/x')).toBeDefined();
  });

  it('clicking a worktree option calls onAssignWorktree', () => {
    const props = {
      ...defaultProps(),
      worktrees: [
        { path: '/repos/feature', branchName: 'feature/x', isMainWorktree: false },
      ],
    };
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    fireEvent.click(screen.getByText('feature/x'));
    expect(props.onAssignWorktree).toHaveBeenCalledWith(42, '/repos/feature');
  });

  it('closes context menu on outside click', () => {
    const props = defaultProps();
    render(<WorkItemCard {...props} />);

    fireEvent.contextMenu(screen.getByText('Fix login bug'));
    expect(screen.getByText('Open in browser')).toBeDefined();

    // Click outside (on document body)
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Open in browser')).toBeNull();
  });
});
