import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AdoQueryTreeNode, QueryBrowser } from '../QueryBrowser';

// ---------- factories ----------

function makeQueryNode(overrides: Partial<AdoQueryTreeNode> = {}): AdoQueryTreeNode {
  return {
    id: 'q-1',
    name: 'Active Bugs',
    path: 'Shared Queries/Active Bugs',
    isFolder: false,
    hasChildren: false,
    children: [],
    isFavorite: false,
    isExpanded: false,
    ...overrides,
  };
}

function makeFolderNode(
  id: string,
  name: string,
  children: AdoQueryTreeNode[] = [],
): AdoQueryTreeNode {
  return makeQueryNode({
    id,
    name,
    isFolder: true,
    hasChildren: children.length > 0,
    children,
    path: `Shared Queries/${name}`,
  });
}

function defaultProps() {
  return {
    queryTree: [] as AdoQueryTreeNode[],
    favoriteQueries: [] as AdoQueryTreeNode[],
    isLoading: false,
    errorMessage: undefined as string | undefined,
    selectedQueryId: undefined as string | undefined,
    onSelectQuery: vi.fn(),
    onToggleFavorite: vi.fn(),
    onClose: vi.fn(),
  };
}

// ---------- tests ----------

describe('QueryBrowser', () => {
  afterEach(cleanup);

  // ---- Header ----

  it('renders header with "Saved Queries" title', () => {
    render(<QueryBrowser {...defaultProps()} />);
    expect(screen.getByText('Saved Queries')).toBeDefined();
  });

  it('calls onClose when close button clicked', () => {
    const props = defaultProps();
    render(<QueryBrowser {...props} />);
    // Close button is in the header
    const headerButtons = document.querySelectorAll('button');
    // First button is the close button in header
    fireEvent.click(headerButtons[0]!);
    expect(props.onClose).toHaveBeenCalled();
  });

  // ---- Loading state ----

  it('shows loading spinner when isLoading', () => {
    const props = defaultProps();
    props.isLoading = true;
    const { container } = render(<QueryBrowser {...props} />);
    expect(container.querySelector('.animate-spin')).toBeDefined();
  });

  // ---- Error state ----

  it('shows error message when provided', () => {
    const props = defaultProps();
    props.errorMessage = 'Failed to load queries';
    render(<QueryBrowser {...props} />);
    expect(screen.getByText('Failed to load queries')).toBeDefined();
  });

  it('does not show error while loading', () => {
    const props = defaultProps();
    props.isLoading = true;
    props.errorMessage = 'Some error';
    render(<QueryBrowser {...props} />);
    expect(screen.queryByText('Some error')).toBeNull();
  });

  // ---- Flat query list ----

  it('renders query items', () => {
    const props = defaultProps();
    props.queryTree = [
      makeQueryNode({ id: 'q-1', name: 'Active Bugs' }),
      makeQueryNode({ id: 'q-2', name: 'My Tasks' }),
    ];
    render(<QueryBrowser {...props} />);
    expect(screen.getByText('Active Bugs')).toBeDefined();
    expect(screen.getByText('My Tasks')).toBeDefined();
  });

  it('calls onSelectQuery when a query item is clicked', () => {
    const props = defaultProps();
    props.queryTree = [makeQueryNode({ id: 'q-1', name: 'Active Bugs' })];
    render(<QueryBrowser {...props} />);
    fireEvent.click(screen.getByText('Active Bugs'));
    expect(props.onSelectQuery).toHaveBeenCalledWith('q-1');
  });

  // ---- Favorite queries ----

  it('renders favorite queries section', () => {
    const props = defaultProps();
    props.favoriteQueries = [
      makeQueryNode({ id: 'q-fav', name: 'My Favorites', isFavorite: true }),
    ];
    render(<QueryBrowser {...props} />);
    expect(screen.getByText('Favorites')).toBeDefined();
    expect(screen.getByText('My Favorites')).toBeDefined();
  });

  it('calls onSelectQuery when a favorite is clicked', () => {
    const props = defaultProps();
    props.favoriteQueries = [makeQueryNode({ id: 'q-fav', name: 'My Fav' })];
    render(<QueryBrowser {...props} />);
    fireEvent.click(screen.getByText('My Fav'));
    expect(props.onSelectQuery).toHaveBeenCalledWith('q-fav');
  });

  it('does not render Favorites section when empty', () => {
    render(<QueryBrowser {...defaultProps()} />);
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  // ---- Toggle favorite ----

  it('calls onToggleFavorite when star button is clicked on a query item', () => {
    const props = defaultProps();
    props.queryTree = [makeQueryNode({ id: 'q-1', name: 'Active Bugs', isFavorite: false })];
    render(<QueryBrowser {...props} />);

    // The star button is inside the query row
    const row = screen.getByText('Active Bugs').closest('div[class*="group"]')!;
    const starBtn = row.querySelector('button')!;
    fireEvent.click(starBtn);
    expect(props.onToggleFavorite).toHaveBeenCalledWith('q-1');
    // Should NOT have also selected the query (stopPropagation)
    expect(props.onSelectQuery).not.toHaveBeenCalled();
  });

  // ---- Folder expand/collapse ----

  it('renders folder nodes', () => {
    const props = defaultProps();
    props.queryTree = [
      makeFolderNode('f-1', 'Shared Queries', [makeQueryNode({ id: 'q-1', name: 'Bugs' })]),
    ];
    render(<QueryBrowser {...props} />);
    expect(screen.getByText('Shared Queries')).toBeDefined();
    // Children not visible initially (collapsed)
    expect(screen.queryByText('Bugs')).toBeNull();
  });

  it('expands folder on click, revealing children', () => {
    const props = defaultProps();
    props.queryTree = [
      makeFolderNode('f-1', 'Shared Queries', [makeQueryNode({ id: 'q-1', name: 'Bugs' })]),
    ];
    render(<QueryBrowser {...props} />);

    fireEvent.click(screen.getByText('Shared Queries'));
    expect(screen.getByText('Bugs')).toBeDefined();
  });

  it('collapses folder on second click', () => {
    const props = defaultProps();
    props.queryTree = [
      makeFolderNode('f-1', 'Shared Queries', [makeQueryNode({ id: 'q-1', name: 'Bugs' })]),
    ];
    render(<QueryBrowser {...props} />);

    // Expand
    fireEvent.click(screen.getByText('Shared Queries'));
    expect(screen.getByText('Bugs')).toBeDefined();

    // Collapse
    fireEvent.click(screen.getByText('Shared Queries'));
    expect(screen.queryByText('Bugs')).toBeNull();
  });

  it('clicking a child query inside expanded folder calls onSelectQuery', () => {
    const props = defaultProps();
    props.queryTree = [
      makeFolderNode('f-1', 'Shared Queries', [
        makeQueryNode({ id: 'q-inner', name: 'Inner Query' }),
      ]),
    ];
    render(<QueryBrowser {...props} />);

    fireEvent.click(screen.getByText('Shared Queries'));
    fireEvent.click(screen.getByText('Inner Query'));
    expect(props.onSelectQuery).toHaveBeenCalledWith('q-inner');
  });

  // ---- Selected query ----

  it('highlights selected query', () => {
    const props = defaultProps();
    props.queryTree = [
      makeQueryNode({ id: 'q-1', name: 'Selected Query' }),
      makeQueryNode({ id: 'q-2', name: 'Other Query' }),
    ];
    props.selectedQueryId = 'q-1';
    render(<QueryBrowser {...props} />);

    const selectedEl = screen.getByText('Selected Query').closest('div[class*="cursor-pointer"]')!;
    expect(selectedEl.className).toContain('bg-[var(--color-selected-row-bg)]');
  });

  it('highlights selected favorite', () => {
    const props = defaultProps();
    props.favoriteQueries = [makeQueryNode({ id: 'q-fav', name: 'Fav Query' })];
    props.selectedQueryId = 'q-fav';
    render(<QueryBrowser {...props} />);

    const selectedBtn = screen.getByText('Fav Query').closest('button')!;
    expect(selectedBtn.className).toContain('bg-[var(--color-accent)]');
  });

  // ---- Nested folder structure ----

  it('renders deeply nested structure', () => {
    const props = defaultProps();
    props.queryTree = [
      makeFolderNode('f-1', 'Level 1', [
        makeFolderNode('f-2', 'Level 2', [makeQueryNode({ id: 'q-deep', name: 'Deep Query' })]),
      ]),
    ];
    render(<QueryBrowser {...props} />);

    // Expand level 1
    fireEvent.click(screen.getByText('Level 1'));
    expect(screen.getByText('Level 2')).toBeDefined();
    expect(screen.queryByText('Deep Query')).toBeNull();

    // Expand level 2
    fireEvent.click(screen.getByText('Level 2'));
    expect(screen.getByText('Deep Query')).toBeDefined();
  });
});
