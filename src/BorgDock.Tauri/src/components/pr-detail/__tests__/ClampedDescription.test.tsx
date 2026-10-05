import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));

import { ClampedDescription } from '../OverviewTab';

describe('ClampedDescription', () => {
  afterEach(cleanup);

  it('previews complete paragraphs and expands the remaining description', () => {
    render(
      <ClampedDescription
        body={'## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.'}
      />,
    );
    const more = screen.getByRole('button', { name: 'Read full description' });
    const box = screen.getByTestId('markdown');
    expect(box).toHaveTextContent('Second paragraph.');
    expect(box).not.toHaveTextContent('Third paragraph.');
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(box).toHaveTextContent('Third paragraph.');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(box).not.toHaveTextContent('Third paragraph.');
  });

  it('shows a short description whole, without the button', () => {
    render(<ClampedDescription body="Short." />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('Short.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('keeps a fenced block intact when expanding', () => {
    const body = 'Summary.\n\n```ts\nconst proof = true;\n```\n\nMore detail.';
    render(<ClampedDescription body={body} />);
    expect(screen.getByTestId('markdown').textContent).toBe('Summary.');
    fireEvent.click(screen.getByRole('button', { name: 'Read full description' }));
    expect(screen.getByTestId('markdown').textContent).toBe(body);
  });
});
