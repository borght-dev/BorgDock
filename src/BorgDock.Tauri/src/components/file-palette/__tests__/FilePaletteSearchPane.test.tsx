import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import { FilePaletteSearchPane } from '../FilePaletteSearchPane';

const baseProps = {
  query: '',
  onQueryChange: () => {},
  parsed: { mode: 'filename' as const, query: '' },
  resultCount: 0,
  scope: 'all' as const,
  onScopeChange: () => {},
  changesCount: 0,
};

describe('FilePaletteSearchPane scope chips', () => {
  it('renders all 5 chips', () => {
    render(<FilePaletteSearchPane {...baseProps} />);
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filename/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Content/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Symbol/ })).toBeInTheDocument();
  });

  it('clicking Content chip rewrites query with > prefix', () => {
    const onQueryChange = vi.fn();
    const onScopeChange = vi.fn();
    render(
      <FilePaletteSearchPane
        {...baseProps}
        query="foo"
        parsed={{ mode: 'filename', query: 'foo' }}
        onQueryChange={onQueryChange}
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Content/ }));
    expect(onQueryChange).toHaveBeenCalledWith('>foo');
    expect(onScopeChange).toHaveBeenCalledWith('content');
  });

  it('clicking All chip strips prefix from query', () => {
    const onQueryChange = vi.fn();
    render(
      <FilePaletteSearchPane
        {...baseProps}
        query=">foo"
        parsed={{ mode: 'content', query: 'foo' }}
        onQueryChange={onQueryChange}
        onScopeChange={vi.fn()}
        scope="content"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(onQueryChange).toHaveBeenCalledWith('foo');
  });

  it('renders Changes count badge when > 0', () => {
    render(<FilePaletteSearchPane {...baseProps} changesCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
