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
import { useUpdateStore } from '@/stores/update-store';
import { MainWindow } from '../MainWindow';

describe('MainWindow', () => {
  beforeEach(() => {
    useUiStore.setState({ activeSection: 'focus', viewStack: [{ kind: 'list' }] });
    useUpdateStore.getState().reset();
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

  it('keeps the title bar free of update chrome while there is nothing to do', () => {
    render(
      <MainWindow>
        <div />
      </MainWindow>,
    );
    expect(screen.queryByRole('button', { name: /update|available/i })).not.toBeInTheDocument();
  });

  it('offers the restart in the title bar once an update is downloaded', () => {
    useUpdateStore.getState().setStatus({
      phase: 'ready',
      currentVersion: '4.16.0',
      version: '4.17.0',
      progress: 100,
      lastCheckedAt: '2026-11-24T09:00:10Z',
      lastError: null,
    });
    const { container } = render(
      <MainWindow>
        <div />
      </MainWindow>,
    );
    const chip = screen.getByRole('button', { name: 'Restart to update' });
    const right = container.querySelector('.bd-mainwindow__right');
    expect(right?.firstElementChild).toBe(chip);
  });

  describe('rail layout', () => {
    it('renders the rail, a title bar without tabs, the body and the window controls', () => {
      render(
        <MainWindow>
          <div data-testid="content">section body</div>
        </MainWindow>,
      );
      const nav = screen.getByRole('navigation', { name: 'Sections' });
      expect(within(nav).getAllByRole('button')).toHaveLength(5);
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.getByLabelText('Refresh')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('keeps Settings and Open window in the rail, not in the title bar', () => {
      const { container } = render(
        <MainWindow>
          <div />
        </MainWindow>,
      );
      const titleBarActions = container.querySelector<HTMLElement>('.bd-mainwindow__right')!;
      expect(within(titleBarActions).queryByLabelText('Settings')).toBeNull();
      expect(within(titleBarActions).queryByLabelText('Open window')).toBeNull();
      expect(within(titleBarActions).getByLabelText('Refresh')).toBeInTheDocument();
      const rail = screen.getByRole('complementary', { name: 'Navigation' });
      expect(within(rail).getByLabelText('Settings')).toBeInTheDocument();
      expect(within(rail).getByLabelText('Open window')).toBeInTheDocument();
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
  });
});
