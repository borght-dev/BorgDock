import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueriesRail } from '../QueriesRail';

describe('QueriesRail', () => {
  it('renders favorites and my-queries sections; click selects', () => {
    const onSelect = vi.fn();
    render(
      <QueriesRail
        favorites={[{ id: 'q1', name: 'Assigned to Me', count: 12 }]}
        myQueries={[{ id: 'q2', name: 'Active Bugs', count: 28 }]}
        selectedId="q1"
        onSelectQuery={onSelect}
        onToggleFavorite={() => {}}
        onOpenQueryBrowser={() => {}}
      />,
    );
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('My Queries')).toBeInTheDocument();
    expect(screen.getByText('Assigned to Me')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Active Bugs'));
    expect(onSelect).toHaveBeenCalledWith('q2');
  });

  it('opens query browser when "Browse all queries…" is clicked', () => {
    const onOpenBrowser = vi.fn();
    render(
      <QueriesRail
        favorites={[]}
        myQueries={[]}
        selectedId={undefined}
        onSelectQuery={() => {}}
        onToggleFavorite={() => {}}
        onOpenQueryBrowser={onOpenBrowser}
      />,
    );
    fireEvent.click(screen.getByText(/Browse all queries/));
    expect(onOpenBrowser).toHaveBeenCalledTimes(1);
  });

  it('toggles favorite from the rail star button without selecting the query', () => {
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <QueriesRail
        favorites={[{ id: 'q1', name: 'Assigned to Me' }]}
        myQueries={[{ id: 'q2', name: 'Active Bugs' }]}
        selectedId={undefined}
        onSelectQuery={onSelect}
        onToggleFavorite={onToggleFavorite}
        onOpenQueryBrowser={() => {}}
      />,
    );

    // Add to favorites from My Queries.
    fireEvent.click(screen.getByLabelText('Add Active Bugs to favorites'));
    expect(onToggleFavorite).toHaveBeenCalledWith('q2');
    expect(onSelect).not.toHaveBeenCalled();

    // Remove from favorites in the Favorites section.
    fireEvent.click(screen.getByLabelText('Remove Assigned to Me from favorites'));
    expect(onToggleFavorite).toHaveBeenCalledWith('q1');
  });
});
