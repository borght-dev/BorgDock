// src/components/work-items/WorkItemDetailPanel/__tests__/ChipPicker.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipPicker } from '../ChipPicker';

describe('ChipPicker', () => {
  it('renders the label and value preview', () => {
    render(
      <ChipPicker
        label="State"
        options={['New', 'Active']}
        value="New"
        onChange={() => {}}
      >
        <span>New</span>
      </ChipPicker>,
    );
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('opens menu on click and emits onChange', () => {
    const onChange = vi.fn();
    render(
      <ChipPicker
        label="State"
        options={['New', 'Active']}
        value="New"
        onChange={onChange}
      >
        <span>New</span>
      </ChipPicker>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Active'));
    expect(onChange).toHaveBeenCalledWith('Active');
  });
});
