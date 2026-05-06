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

  it('opens menu on click and emits onChange (string options)', () => {
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

  it('renders option labels separately from values for {value,label} pairs', () => {
    const onChange = vi.fn();
    render(
      <ChipPicker
        label="Priority"
        options={[
          { value: '1', label: 'P1 · Urgent' },
          { value: '2', label: 'P2 · High' },
        ]}
        value="2"
        onChange={onChange}
      >
        <span>P2</span>
      </ChipPicker>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('P1 · Urgent'));
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('opens a free-text input when options is empty and emits on Enter', () => {
    const onChange = vi.fn();
    render(
      <ChipPicker
        label="Assignee"
        value="Alice"
        onChange={onChange}
        placeholder="display name"
      >
        <span>Alice</span>
      </ChipPicker>,
    );
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText('display name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bob' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Bob');
  });

  it('cancels free-text edit on Escape without firing onChange', () => {
    const onChange = vi.fn();
    render(
      <ChipPicker label="Assignee" value="Alice" onChange={onChange}>
        <span>Alice</span>
      </ChipPicker>,
    );
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByDisplayValue('Alice');
    fireEvent.change(input, { target: { value: 'Bob' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
