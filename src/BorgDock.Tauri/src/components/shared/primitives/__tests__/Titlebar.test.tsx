import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Titlebar } from '../Titlebar';

describe('Titlebar', () => {
  it('renders the title inside a bd-titlebar container', () => {
    render(<Titlebar title="Pull Requests" data-testid="tb" />);
    const el = screen.getByTestId('tb');
    expect(el).toHaveClass('bd-titlebar');
    expect(screen.getByText('Pull Requests')).toHaveClass('bd-titlebar__title');
  });

  it('renders the count badge when provided', () => {
    render(<Titlebar title="PRs" count={4} />);
    const el = screen.getByText('4');
    expect(el).toHaveClass('bd-titlebar__count');
  });

  it('omits the count badge when count is undefined', () => {
    render(<Titlebar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-titlebar__count')).toBeNull();
  });

  it('shows count=0 (zero is a valid value)', () => {
    render(<Titlebar title="PRs" count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders meta content in its own slot', () => {
    render(<Titlebar title="PRs" meta={<span data-testid="meta" />} />);
    expect(screen.getByTestId('meta').closest('.bd-titlebar__meta')).not.toBeNull();
  });

  it('replaces the default left slot entirely when left is passed', () => {
    render(
      <Titlebar
        title="PRs"
        count={99}
        left={<span data-testid="custom-left">custom</span>}
      />,
    );
    expect(screen.getByTestId('custom-left')).toBeInTheDocument();
    // The default title + count are NOT rendered when a custom left is supplied.
    expect(screen.queryByText('PRs')).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('renders right slot content after the spacer', () => {
    render(<Titlebar title="PRs" right={<button type="button">Close</button>} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('includes a flex spacer between middle and right', () => {
    render(<Titlebar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-titlebar__spacer')).not.toBeNull();
  });
});
