import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityStrip } from '../ActivityStrip';

describe('ActivityStrip', () => {
  it('renders nothing when there are no relevant checks', () => {
    const { container } = render(
      <ActivityStrip passed={0} running={0} failing={0} total={0} onJumpToChecks={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows running count when running > 0', () => {
    render(
      <ActivityStrip passed={13} running={2} failing={0} total={15} onJumpToChecks={() => {}} />,
    );
    expect(screen.getByText(/2 checks still running/i)).toBeInTheDocument();
    expect(screen.getByText(/13\/15 passed/i)).toBeInTheDocument();
  });

  it('shows failing copy when failing > 0', () => {
    render(
      <ActivityStrip passed={10} running={0} failing={1} total={15} onJumpToChecks={() => {}} />,
    );
    expect(screen.getByText(/1 check failing/i)).toBeInTheDocument();
  });

  it('shows all-passed when nothing is running and nothing is failing', () => {
    render(
      <ActivityStrip passed={15} running={0} failing={0} total={15} onJumpToChecks={() => {}} />,
    );
    expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
  });

  it('fires onJumpToChecks on click', () => {
    const cb = vi.fn();
    render(<ActivityStrip passed={1} running={1} failing={0} total={3} onJumpToChecks={cb} />);
    fireEvent.click(screen.getByRole('button'));
    expect(cb).toHaveBeenCalled();
  });
});
