import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPanel } from '../CheckoutPanel';

const mockInvoke = vi.fn().mockResolvedValue([]);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
});

const defaultProps = {
  branchName: 'feat/test',
  repoBasePath: '/tmp/repo',
  worktreeSubfolder: '.worktrees',
  onDismiss: vi.fn(),
};

describe('CheckoutPanel', () => {
  it('renders the picker stage with data-checkout-stage="picker"', async () => {
    const { container } = render(<CheckoutPanel {...defaultProps} />);
    await waitFor(() => {
      expect(container.querySelector('[data-checkout-stage="picker"]')).toBeInTheDocument();
    });
  });

  it('renders a dismiss IconButton', async () => {
    const { container } = render(<CheckoutPanel {...defaultProps} />);
    await waitFor(() => {
      expect(container.querySelector('[data-checkout-dismiss]')).toBeInTheDocument();
    });
  });

  it('renders Cancel + primary action buttons in the picker', async () => {
    const { container } = render(<CheckoutPanel {...defaultProps} />);
    await waitFor(() => {
      expect(container.querySelector('[data-checkout-action="cancel"]')).toBeInTheDocument();
      expect(container.querySelector('[data-checkout-action="configure"]')).toBeInTheDocument();
    });
  });

  it('shows the favorites toggle when favorites are configured', async () => {
    const { container } = render(<CheckoutPanel {...defaultProps} favoritePaths={['/tmp/fav']} />);
    await waitFor(() => {
      expect(container.querySelector('[data-checkout-favorites-toggle]')).toBeInTheDocument();
    });
  });

  it('hands the worktree path over when the branch is already checked out', async () => {
    const onWorktreeReady = vi.fn();
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'list_worktrees_bare'
          ? [
              {
                path: '/tmp/repo/.worktrees/feat-test',
                branchName: 'feat/test',
                isMainWorktree: false,
              },
            ]
          : [],
      ),
    );
    render(<CheckoutPanel {...defaultProps} onWorktreeReady={onWorktreeReady} />);
    await waitFor(() => {
      expect(onWorktreeReady).toHaveBeenCalledWith('/tmp/repo/.worktrees/feat-test');
    });
    expect(onWorktreeReady).toHaveBeenCalledTimes(1);
    mockInvoke.mockReset().mockResolvedValue([]);
  });

  it('shows a T3 launch button on the ready surface when onOpenInT3 is set', async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === 'list_worktrees_bare'
          ? [
              {
                path: '/tmp/repo/.worktrees/feat-test',
                branchName: 'feat/test',
                isMainWorktree: false,
              },
            ]
          : [],
      ),
    );
    const { container } = render(<CheckoutPanel {...defaultProps} onOpenInT3={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector('[data-checkout-launch="t3"]')).toBeInTheDocument();
    });
    mockInvoke.mockReset().mockResolvedValue([]);
  });
});
