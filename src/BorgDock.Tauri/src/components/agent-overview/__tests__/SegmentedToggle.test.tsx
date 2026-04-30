import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedToggle } from '../SegmentedToggle';

describe('SegmentedToggle', () => {
  it('emits onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        value="a"
        onChange={onChange}
        options={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}
      />,
    );
    fireEvent.click(screen.getByText('B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
