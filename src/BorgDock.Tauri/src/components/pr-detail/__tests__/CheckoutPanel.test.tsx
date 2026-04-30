import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPanel } from '../CheckoutPanel';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
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
      expect(
        container.querySelector('[data-checkout-action="cancel"]'),
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-checkout-action="configure"]'),
      ).toBeInTheDocument();
    });
  });

  it('shows the favorites toggle when favorites are configured', async () => {
    const { container } = render(
      <CheckoutPanel {...defaultProps} favoritePaths={['/tmp/fav']} />,
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-checkout-favorites-toggle]'),
      ).toBeInTheDocument();
    });
  });
});
