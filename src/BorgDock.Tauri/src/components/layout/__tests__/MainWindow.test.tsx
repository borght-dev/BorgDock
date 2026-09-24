import { render, screen, within } from '@testing-library/react';
import { useLayoutEffect } from 'react';
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

import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { MainWindow } from '../MainWindow';

function setLayoutV3(layoutV3: boolean) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ui: { ...s.settings.ui, layoutV3 } },
  }));
}

describe('MainWindow', () => {
  beforeEach(() => {
    setLayoutV3(false);
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

  describe('tab layout (layoutV3 off)', () => {
    it('puts the section tabs in the title bar and renders no rail', () => {
      render(
        <MainWindow>
          <div />
        </MainWindow>,
      );
      expect(screen.getByRole('tab', { name: /Focus/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /PRs/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Work Items/ })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
    });

    it('shows Focus for a saved Worktrees section from the first render', () => {
      useUiStore.setState({ activeSection: 'worktrees' });
      // Reads the first committed DOM, before any effect could correct it.
      const firstCommit: (string | null)[] = [];
      function Probe() {
        useLayoutEffect(() => {
          firstCommit.push(
            document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null,
          );
        }, []);
        return null;
      }
      render(
        <MainWindow>
          <Probe />
        </MainWindow>,
      );
      expect(firstCommit).toHaveLength(1);
      expect(firstCommit[0]).toMatch(/^Focus/);
      expect(screen.getByRole('tab', { name: /Focus/ })).toHaveAttribute('aria-selected', 'true');
      // The status bar follows the section on screen, not the saved one.
      expect(screen.getByText(/weights from settings/)).toBeInTheDocument();
      // The store is brought in line so keys that read it match the screen.
      expect(useUiStore.getState().activeSection).toBe('focus');
    });
  });

  describe('rail layout (layoutV3 on)', () => {
    beforeEach(() => setLayoutV3(true));

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
