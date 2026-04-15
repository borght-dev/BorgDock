import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Release } from '@/types/whats-new';
import { ReleaseAccordion } from '../ReleaseAccordion';

const release: Release = {
  version: '1.0.11',
  date: '2026-04-14',
  summary: 'A and B.',
  highlights: [
    {
      kind: 'new',
      title: 'A',
      description: 'first',
      hero: null,
      keyboard: null,
    },
  ],
  alsoFixed: ['tiny fix'],
  autoOpenEligible: true,
};

describe('ReleaseAccordion', () => {
  it('shows version and date in the header', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={true} />);
    expect(screen.getByText('1.0.11')).toBeTruthy();
    expect(screen.getByText('2026-04-14')).toBeTruthy();
  });

  it('shows Current pill when isCurrent is true and expanded', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={true} isCurrent={true} />);
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('collapsed state hides highlights and shows the summary', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={false} />);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.getByText(/A and B\./)).toBeTruthy();
  });

  it('expands when the header is clicked', () => {
    render(<ReleaseAccordion release={release} defaultExpanded={false} isCurrent={false} />);
    const trigger = screen.getByRole('button', { name: /1\.0\.11/i });
    fireEvent.click(trigger);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText(/tiny fix/i)).toBeTruthy();
  });
});
