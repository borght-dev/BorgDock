import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PriorityFactor } from '@/services/priority-scoring';
import { PriorityReasonLabel } from '../PriorityReasonLabel';

afterEach(cleanup);

describe('PriorityReasonLabel', () => {
  it('renders nothing when factors is empty', () => {
    const { container } = render(<PriorityReasonLabel factors={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a single factor label', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    expect(screen.getByText('Ready to merge')).toBeDefined();
  });

  it('renders multiple factors separated by dots', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
      { type: 'myPrRedChecks', points: 20, label: 'Build failing' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    expect(screen.getByText('Ready to merge')).toBeDefined();
    expect(screen.getByText('Build failing')).toBeDefined();
    expect(screen.getByText('\u00b7')).toBeDefined();
  });

  it('applies green styling for readyToMerge factor', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Ready to merge');
    expect(el.className).toContain('text-[var(--color-status-green)]');
    expect(el.className).toContain('font-medium');
  });

  it('applies red styling for red-check factors', () => {
    const factors: PriorityFactor[] = [
      { type: 'myPrRedChecks', points: 20, label: 'Build failing' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Build failing');
    expect(el.className).toContain('text-[var(--color-status-red)]');
  });

  it('applies red styling for othersRedChecks factor', () => {
    const factors: PriorityFactor[] = [
      { type: 'othersRedChecks', points: 15, label: 'Checks failing' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Checks failing');
    expect(el.className).toContain('text-[var(--color-status-red)]');
  });

  it('applies yellow styling for staleness factors', () => {
    const factors: PriorityFactor[] = [{ type: 'staleness', points: 10, label: 'Getting stale' }];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Getting stale');
    expect(el.className).toContain('text-[var(--color-status-yellow)]');
  });

  it('applies yellow styling for reviewStale factor', () => {
    const factors: PriorityFactor[] = [{ type: 'reviewStale', points: 8, label: 'Review stale' }];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Review stale');
    expect(el.className).toContain('text-[var(--color-status-yellow)]');
  });

  it('applies no special styling for generic factor types', () => {
    const factors: PriorityFactor[] = [{ type: 'someGeneric', points: 5, label: 'Generic factor' }];
    render(<PriorityReasonLabel factors={factors} />);
    const el = screen.getByText('Generic factor');
    expect(el.className).toBe('');
  });

  it('renders three or more factors with separators between each', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready' },
      { type: 'staleness', points: 10, label: 'Stale' },
      { type: 'myPrRedChecks', points: 20, label: 'Red' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    expect(screen.getByText('Ready')).toBeDefined();
    expect(screen.getByText('Stale')).toBeDefined();
    expect(screen.getByText('Red')).toBeDefined();
    expect(screen.getAllByText('\u00b7')).toHaveLength(2);
  });
});
