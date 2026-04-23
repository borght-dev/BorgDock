import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MergeScoreBadge } from '../MergeScoreBadge';

afterEach(cleanup);

describe('MergeScoreBadge', () => {
  it('renders the score value', () => {
    render(<MergeScoreBadge score={75} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<MergeScoreBadge score={50} />);
    expect(screen.getByLabelText('Merge score: 50%')).toBeInTheDocument();
  });

  it('clamps score to 0 minimum', () => {
    render(<MergeScoreBadge score={-10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByLabelText('Merge score: 0%')).toBeInTheDocument();
  });

  it('clamps score to 100 maximum', () => {
    render(<MergeScoreBadge score={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByLabelText('Merge score: 100%')).toBeInTheDocument();
  });

  it('uses red color for scores <= 33', () => {
    const { container } = render(<MergeScoreBadge score={20} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-red)');
    expect(div?.style.border).toContain('var(--color-status-red)');
  });

  it('uses yellow color for scores between 34 and 66', () => {
    const { container } = render(<MergeScoreBadge score={50} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-yellow)');
  });

  it('uses green color for scores > 66', () => {
    const { container } = render(<MergeScoreBadge score={80} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-green)');
  });

  it('uses red for boundary score 33', () => {
    const { container } = render(<MergeScoreBadge score={33} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-red)');
  });

  it('uses yellow for boundary score 66', () => {
    const { container } = render(<MergeScoreBadge score={66} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-yellow)');
  });

  it('uses green for boundary score 67', () => {
    const { container } = render(<MergeScoreBadge score={67} />);
    const div = container.querySelector('div');
    expect(div?.style.color).toBe('var(--color-status-green)');
  });
});
