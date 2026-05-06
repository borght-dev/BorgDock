// src/components/work-items/WorkItemDetailPanel/__tests__/TitleBlock.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TitleBlock } from '../TitleBlock';

const baseProps = {
  id: 54519,
  title: 'Quotes: success toast on failure',
  workItemType: 'Bug',
  state: 'Testing Failed',
  priority: 2 as number | undefined,
  assignedTo: 'Koen van der Borght',
  iteration: 'R5.2.7.5',
  availableStates: ['New', 'Active', 'Resolved', 'Testing Failed'],
  changedAgo: '2h',
  onChange: vi.fn(),
  onCopyId: vi.fn(),
  onOpenInBrowser: vi.fn(),
};

describe('TitleBlock', () => {
  it('renders type, ID, and title', () => {
    render(<TitleBlock {...baseProps} />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('#54519')).toBeInTheDocument();
    expect(screen.getByText(/success toast/)).toBeInTheDocument();
  });

  it('switches title to an input on click and emits onChange on blur', () => {
    const onChange = vi.fn();
    render(<TitleBlock {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByText(/success toast/));
    const input = screen.getByDisplayValue(baseProps.title);
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ title: 'New title' });
  });

  it('emits onChange when state ChipPicker option chosen', () => {
    const onChange = vi.fn();
    render(<TitleBlock {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('STATE'));
    fireEvent.click(screen.getByText('Resolved'));
    expect(onChange).toHaveBeenCalledWith({ state: 'Resolved' });
  });
});
