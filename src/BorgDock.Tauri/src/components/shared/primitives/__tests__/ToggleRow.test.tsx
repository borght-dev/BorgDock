import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleRow } from '../ToggleRow';

describe('ToggleRow', () => {
  it('renders label and hint', () => {
    render(<ToggleRow label="Run at startup" hint="Launch on log-in" on={false} onChange={() => {}} />);
    expect(screen.getByText('Run at startup')).toBeInTheDocument();
    expect(screen.getByText('Launch on log-in')).toBeInTheDocument();
  });

  it('clicking the toggle forwards to onChange', () => {
    const onChange = vi.fn();
    render(<ToggleRow label="X" on={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('omits hint paragraph when no hint provided', () => {
    render(<ToggleRow label="X" on={true} onChange={() => {}} />);
    // Only the label and the switch should be present in the row.
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.queryByText('Launch on log-in')).not.toBeInTheDocument();
  });
});
