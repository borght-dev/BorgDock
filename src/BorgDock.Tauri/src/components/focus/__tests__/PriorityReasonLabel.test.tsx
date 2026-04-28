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

  it('renders the top factor label', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    expect(screen.getByText('Ready to merge')).toBeDefined();
  });

  it('only renders the top (first) factor', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
      { type: 'myPrRedChecks', points: 20, label: 'Build failing' },
    ];
    render(<PriorityReasonLabel factors={factors} />);
    expect(screen.getByText('Ready to merge')).toBeDefined();
    expect(screen.queryByText('Build failing')).toBeNull();
  });

  it('exposes the factor type via data-priority-reason', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
    ];
    const { container } = render(<PriorityReasonLabel factors={factors} />);
    const pill = container.querySelector('[data-priority-reason]');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('data-priority-reason')).toBe('readyToMerge');
    expect(pill?.textContent).toBe('Ready to merge');
  });

  it('reflects whichever type is the top factor', () => {
    const factors: PriorityFactor[] = [
      { type: 'myPrRedChecks', points: 30, label: 'Build failing' },
      { type: 'readyToMerge', points: 10, label: 'Ready to merge' },
    ];
    const { container } = render(<PriorityReasonLabel factors={factors} />);
    const pill = container.querySelector('[data-priority-reason]');
    expect(pill?.getAttribute('data-priority-reason')).toBe('myPrRedChecks');
  });

  it('renders the Pill primitive class', () => {
    const factors: PriorityFactor[] = [
      { type: 'readyToMerge', points: 45, label: 'Ready to merge' },
    ];
    const { container } = render(<PriorityReasonLabel factors={factors} />);
    const pill = container.querySelector('[data-priority-reason]');
    expect(pill?.classList.contains('bd-pill')).toBe(true);
    expect(pill?.classList.contains('bd-pill--neutral')).toBe(true);
  });
});
