import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrLabels } from '../PrLabels';

describe('PrLabels', () => {
  it("draws each label in GitHub's colour", () => {
    render(
      <PrLabels pr={{ labels: ['bug', 'ux'], labelColors: { bug: 'd73a4a', ux: '7057ff' } }} />,
    );
    const list = screen.getByRole('list', { name: 'Labels' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['bug', 'ux']);
    expect(screen.getByText('bug').getAttribute('style')).toContain('--label: #d73a4a');
  });

  it('falls back to the neutral colour for a missing or malformed colour', () => {
    render(<PrLabels pr={{ labels: ['odd', 'none'], labelColors: { odd: 'red;x' } }} />);
    expect(screen.getByText('odd').getAttribute('style')).toBeNull();
    expect(screen.getByText('none').getAttribute('style')).toBeNull();
  });

  it('renders nothing without labels', () => {
    const { container } = render(<PrLabels pr={{ labels: [] }} />);
    expect(container.innerHTML).toBe('');
  });
});
