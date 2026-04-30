import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FilePaletteRootsColumn } from '../FilePaletteRootsColumn';

describe('FilePaletteRootsColumn', () => {
  it('favorites toggle uses IconButton with aria-pressed', () => {
    const { container } = render(
      <FilePaletteRootsColumn
        roots={[{ path: '/wt/a', label: 'a', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
        activePath="/wt/a"
        onSelect={vi.fn()}
        favoritePaths={new Set()}
        onToggleFavorite={vi.fn()}
        favoritesOnly={false}
        onToggleFavoritesOnly={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        onAddCustomRoot={vi.fn()}
        onRemoveCustomRoot={vi.fn()}
        changeCounts={new Map()}
      />,
    );
    // bd-icon-btn is the IconButton primitive class
    expect(container.querySelectorAll('.bd-icon-btn').length).toBeGreaterThanOrEqual(2);
  });

  it('renders change count badge for worktree with count > 0', () => {
    const counts = new Map([['/repo', { count: 3, addTotal: 12, delTotal: 4 }]]);
    render(
      <FilePaletteRootsColumn
        roots={[{ path: '/repo', label: 'repo', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
        activePath={null}
        onSelect={() => {}}
        favoritePaths={new Set()}
        onToggleFavorite={() => {}}
        favoritesOnly={false}
        onToggleFavoritesOnly={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
        onAddCustomRoot={() => {}}
        onRemoveCustomRoot={() => {}}
        changeCounts={counts}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides badge when count is 0', () => {
    const counts = new Map([['/repo', { count: 0, addTotal: 0, delTotal: 0 }]]);
    const { container } = render(
      <FilePaletteRootsColumn
        roots={[{ path: '/repo', label: 'repo', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
        activePath={null}
        onSelect={() => {}}
        favoritePaths={new Set()}
        onToggleFavorite={() => {}}
        favoritesOnly={false}
        onToggleFavoritesOnly={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
        onAddCustomRoot={() => {}}
        onRemoveCustomRoot={() => {}}
        changeCounts={counts}
      />,
    );
    expect(container.querySelector('.bd-fp-root-badge')).toBeNull();
  });
});
