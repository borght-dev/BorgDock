import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('@/stores/pr-store', () => ({
  usePrStore: (selector: (s: unknown) => unknown) => selector({ pullRequests: [], closedPullRequests: [] }),
}));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { repos: [] } }),
}));

import { WorktreePruneDialog } from '../WorktreePruneDialog';

describe('WorktreePruneDialog', () => {
  it('renders a dialog with role="dialog"', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('Remove button is disabled when no rows are selected', () => {
    render(<WorktreePruneDialog isOpen={true} onClose={vi.fn()} />);
    const removeBtn = screen.getByRole('button', { name: /remove selected/i });
    expect(removeBtn).toBeDisabled();
  });
});
