import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkItemPaletteRow } from '../WorkItemPaletteRow';

const baseItem = {
  id: 1234,
  title: 'Sample work item',
  state: 'Active',
  workItemType: 'Bug',
  assignedTo: 'Alice',
};

describe('WorkItemPaletteRow', () => {
  it('renders item ID, title, type, and state', () => {
    render(
      <WorkItemPaletteRow
        item={baseItem}
        isSelected={false}
        onMouseEnter={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('#1234')).toBeTruthy();
    expect(screen.getByText('Sample work item')).toBeTruthy();
    expect(screen.getByText('Bug')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('preserves data-palette-row attribute', () => {
    const { container } = render(
      <WorkItemPaletteRow
        item={baseItem}
        isSelected={false}
        onMouseEnter={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-palette-row]')).not.toBeNull();
  });

  it('applies selected background when isSelected is true', () => {
    const { container } = render(
      <WorkItemPaletteRow
        item={baseItem}
        isSelected={true}
        onMouseEnter={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const row = container.querySelector('[data-palette-row]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.className).toMatch(/bg-(?:accent|\[var\(--color-accent-subtle\))/);
  });
});
