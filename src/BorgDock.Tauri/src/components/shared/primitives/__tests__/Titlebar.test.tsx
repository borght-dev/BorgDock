import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TitleBar } from '../TitleBar';

describe('TitleBar', () => {
  it('renders the title inside a bd-title-bar container', () => {
    render(<TitleBar title="Pull Requests" data-testid="tb" />);
    const el = screen.getByTestId('tb');
    expect(el).toHaveClass('bd-title-bar');
    expect(screen.getByText('Pull Requests')).toHaveClass('bd-title-bar__title');
  });

  it('renders the count badge when provided', () => {
    render(<TitleBar title="PRs" count={4} />);
    const el = screen.getByText('4');
    expect(el).toHaveClass('bd-title-bar__count');
  });

  it('omits the count badge when count is undefined', () => {
    render(<TitleBar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-title-bar__count')).toBeNull();
  });

  it('shows count=0 (zero is a valid value)', () => {
    render(<TitleBar title="PRs" count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders meta content in its own slot', () => {
    render(<TitleBar title="PRs" meta={<span data-testid="meta" />} />);
    expect(screen.getByTestId('meta').closest('.bd-title-bar__meta')).not.toBeNull();
  });

  it('replaces the default left slot entirely when left is passed', () => {
    render(
      <TitleBar
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
    render(<TitleBar title="PRs" right={<button type="button">Close</button>} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('includes a flex spacer between middle and right', () => {
    render(<TitleBar title="PRs" data-testid="tb" />);
    expect(screen.getByTestId('tb').querySelector('.bd-title-bar__spacer')).not.toBeNull();
  });
});
