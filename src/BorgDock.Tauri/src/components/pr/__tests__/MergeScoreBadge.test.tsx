import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MergeScoreBadge } from '../MergeScoreBadge';

afterEach(cleanup);

describe('MergeScoreBadge', () => {
  it('renders the score value inside a Ring', () => {
    const { container } = render(<MergeScoreBadge score={72} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(container.querySelector('.bd-ring')).toBeInTheDocument();
  });

  it('clamps values above 100 to 100', () => {
    render(<MergeScoreBadge score={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('clamps values below 0 to 0', () => {
    render(<MergeScoreBadge score={-5} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('exposes accessible label with score value', () => {
    const { container } = render(<MergeScoreBadge score={50} />);
    const ring = container.querySelector('[aria-label="Merge score: 50%"]');
    expect(ring).toBeInTheDocument();
  });
});
