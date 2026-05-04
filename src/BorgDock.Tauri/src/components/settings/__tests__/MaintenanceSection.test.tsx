import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'get_cache_size') return Promise.resolve(0);
    if (cmd === 'clear_cache') return Promise.resolve({ bytesFreed: 0 });
    if (cmd === 'run_self_test')
      return Promise.resolve([{ service: 'GitHub', ok: true, message: 'ok' }]);
    return Promise.resolve(undefined);
  }),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));

vi.mock('@/components/worktree/WorktreePruneDialog', () => ({
  WorktreePruneDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="prune-dialog" /> : null,
}));

vi.mock('@/stores/onboarding-store', () => ({
  useOnboardingStore: { getState: () => ({ resetAll: vi.fn() }) },
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (sel: (s: unknown) => unknown) =>
    sel({
      settings: {
        repos: [],
        azureDevOps: { organization: '', project: '' },
        sql: { connections: [] },
      },
    }),
}));

import { MaintenanceSection } from '../MaintenanceSection';

describe('MaintenanceSection', () => {
  it('renders three cards (Worktrees, Onboarding & cache, Diagnostics)', () => {
    render(<MaintenanceSection />);
    expect(screen.getByText('Worktrees')).toBeInTheDocument();
    expect(screen.getByText('Onboarding & cache')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('clicking "Prune worktrees" button opens the prune dialog', () => {
    render(<MaintenanceSection />);
    expect(screen.queryByTestId('prune-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prune worktrees' }));
    expect(screen.getByTestId('prune-dialog')).toBeInTheDocument();
  });

  it('clicking "Reset everything" shows the confirm dialog with Cancel and Reset buttons', () => {
    render(<MaintenanceSection />);
    expect(screen.queryByText('Reset everything?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Reset everything'));
    expect(screen.getByText('Reset everything?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Two "Reset everything" buttons: trigger + confirm — both present
    const resetBtns = screen.getAllByText('Reset everything');
    expect(resetBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('clicking "Run self-test" opens results dialog and shows results', async () => {
    render(<MaintenanceSection />);
    expect(screen.queryByRole('dialog', { name: 'Self-test results' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Run self-test'));
    // Dialog should open immediately (showing "Running…")
    expect(screen.getByRole('dialog', { name: 'Self-test results' })).toBeInTheDocument();
    // After promise resolves, results appear
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
