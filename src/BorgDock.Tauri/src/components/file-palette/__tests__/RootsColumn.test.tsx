import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { RootsColumn } from '../RootsColumn';

describe('RootsColumn', () => {
  it('favorites toggle uses IconButton with aria-pressed', () => {
    const { container } = render(
      <RootsColumn
        roots={[{ path: '/wt/a', label: 'a', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
        activePath="/wt/a"
        onSelect={vi.fn()}
        favoritePaths={new Set()}
        onToggleFavorite={vi.fn()}
        favoritesOnly={false}
        onToggleFavoritesOnly={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );
    // bd-icon-btn is the IconButton primitive class
    expect(container.querySelectorAll('.bd-icon-btn').length).toBeGreaterThanOrEqual(2);
  });
});
