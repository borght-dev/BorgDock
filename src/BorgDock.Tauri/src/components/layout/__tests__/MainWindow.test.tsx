import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { useUiStore } from '@/stores/ui-store';
import { MainWindow } from '../MainWindow';

describe('MainWindow', () => {
  beforeEach(() => {
    useUiStore.setState({ activeSection: 'focus', viewStack: [{ kind: 'list' }] });
  });

  it('renders titlebar, section content, and statusbar', () => {
    render(
      <MainWindow>
        <div data-testid="content">section body</div>
      </MainWindow>,
    );
    expect(screen.getByText('BorgDock')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimize')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximize')).toBeInTheDocument();
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  describe('rail layout', () => {
    it('renders the rail, a title bar without tabs, the body and the window controls', () => {
      render(
        <MainWindow>
          <div data-testid="content">section body</div>
        </MainWindow>,
      );
      const nav = screen.getByRole('navigation', { name: 'Sections' });
      expect(within(nav).getAllByRole('button')).toHaveLength(4);
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.getByLabelText('Refresh')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('titles the title bar with the active section', () => {
      useUiStore.setState({ activeSection: 'prs' });
      const { container } = render(
        <MainWindow>
          <div />
        </MainWindow>,
      );
      expect(container.querySelector('.bd-title-bar__title')).toHaveTextContent('Pull requests');
    });

    it('titles the title bar with the detail view on top', () => {
      useUiStore.setState({
        viewStack: [{ kind: 'list' }, { kind: 'pr-detail', owner: 'o', repo: 'r', number: 3 }],
      });
      const { container } = render(
        <MainWindow>
          <div />
        </MainWindow>,
      );
      expect(container.querySelector('.bd-title-bar__title')).toHaveTextContent('Pull request');
    });

    it('keeps the Worktrees section', () => {
      useUiStore.setState({ activeSection: 'worktrees' });
      render(
        <MainWindow>
          <div />
        </MainWindow>,
      );
      expect(useUiStore.getState().activeSection).toBe('worktrees');
    });
  });
});
