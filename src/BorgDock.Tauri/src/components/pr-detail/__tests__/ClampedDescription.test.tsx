import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));

import { ClampedDescription } from '../OverviewTab';

function stubHeights(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
}

describe('ClampedDescription', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers "Show more" only when the text is longer than six lines', () => {
    stubHeights(400, 120);
    render(<ClampedDescription body={'## Summary\n\nA long description.'} />);
    const more = screen.getByRole('button', { name: 'Show more' });
    const box = document.querySelector('.bd-md-clamp')!;
    expect(box).toHaveAttribute('data-overflows', 'true');
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(box).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(box).not.toHaveAttribute('data-open');
  });

  it('shows a short description whole, without the button', () => {
    stubHeights(60, 60);
    render(<ClampedDescription body="Short." />);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(document.querySelector('.bd-md-clamp')).not.toHaveAttribute('data-overflows');
  });
});
