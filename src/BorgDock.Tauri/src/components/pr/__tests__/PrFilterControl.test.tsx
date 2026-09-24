import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrFilter } from '@/stores/pr-store';
import { PrFilterControl, workbenchFilterCounts, workbenchFilterFor } from '../PrFilterControl';

afterEach(cleanup);

const COUNTS = { all: 18, needsYou: 6, mine: 6, failing: 2 };

function renderControl(value: PrFilter = 'all', onChange = vi.fn()) {
  render(<PrFilterControl value={value} counts={COUNTS} onChange={onChange} />);
  return { onChange, group: screen.getByRole('group', { name: 'Filter pull requests' }) };
}

describe('PrFilterControl', () => {
  it('offers All, Needs you, Mine and Failing with their counts', () => {
    const { group } = renderControl();
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['All18', 'Needs you6', 'Mine6', 'Failing2']);
  });

  it('presses the active segment and highlights it', () => {
    const { group } = renderControl('needsYou');
    expect(within(group).getByRole('button', { name: /Needs you/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(group.querySelector('.bd-slide__hl')).not.toHaveClass('bd-slide__hl--hidden');
  });

  it('highlights nothing for a filter it does not offer', () => {
    const { group } = renderControl('ready');
    for (const button of within(group).getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
    expect(group.querySelector('.bd-slide__hl')).toHaveClass('bd-slide__hl--hidden');
  });

  it('reports the chosen store filter, and ignores a click on the active one', () => {
    const { onChange, group } = renderControl('all');
    fireEvent.click(within(group).getByRole('button', { name: /Needs you/ }));
    fireEvent.click(within(group).getByRole('button', { name: /Failing/ }));
    fireEvent.click(within(group).getByRole('button', { name: /^All/ }));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['needsYou', 'failing']);
  });
});

describe('workbenchFilterFor', () => {
  it('maps the four store filters to themselves and the rest to null', () => {
    expect(workbenchFilterFor('all')).toBe('all');
    expect(workbenchFilterFor('needsYou')).toBe('needsYou');
    expect(workbenchFilterFor('mine')).toBe('mine');
    expect(workbenchFilterFor('failing')).toBe('failing');
    for (const other of ['ready', 'reviewing', 'needsReview', 'closed'] as const) {
      expect(workbenchFilterFor(other)).toBeNull();
    }
  });
});

describe('workbenchFilterCounts', () => {
  it('takes the four counts from pr-store.counts()', () => {
    expect(
      workbenchFilterCounts({
        all: 18,
        mine: 6,
        failing: 2,
        ready: 3,
        reviewing: 9,
        needsReview: 4,
        needsYou: 6,
        closed: 3,
      }),
    ).toEqual({ all: 18, needsYou: 6, mine: 6, failing: 2 });
  });
});
