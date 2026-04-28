import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import { SearchPane } from '../SearchPane';
import { parseQuery } from '../parse-query';

describe('SearchPane', () => {
  it('renders an input with placeholder matching /search files/i', () => {
    render(
      <SearchPane query="" onQueryChange={vi.fn()} parsed={parseQuery('')} resultCount={0} />,
    );
    expect(screen.getByPlaceholderText(/search files/i)).toBeInTheDocument();
  });
});
