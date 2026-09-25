import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showPrMock, openPrDetailMock } = vi.hoisted(() => ({
  showPrMock: vi.fn().mockResolvedValue(undefined),
  openPrDetailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
  getClientForRepo: vi.fn(() => null),
}));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
    getMonitorPrompt: vi.fn(),
    getFixPrompt: vi.fn(),
  }),
}));
vi.mock('@/services/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/navigation')>()),
  showPr: showPrMock,
}));
vi.mock('@/services/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/windows')>()),
  openPrDetail: openPrDetailMock,
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { listPr } from '../__fixtures__/pr-list-data';
import { WorkbenchPrRow } from '../WorkbenchPrRow';

const PR = listPr({ number: 42, title: 'Add cool feature', repo: 'acme/app' });
/** Same number, other repository. */
const TWIN = listPr({ number: 42, title: 'Site change', repo: 'acme/site' });
const DETAIL = { owner: 'acme', repo: 'app', number: 42 };
const POP_OUT = { owner: 'acme', repo: 'app', number: 42 };

function row(key = 'acme/app#42') {
  return document.querySelector<HTMLElement>(`.bd-wb-row[data-pr-key="${key}"]`)!;
}

describe('WorkbenchPrRow', () => {
  beforeEach(() => {
    showPrMock.mockClear();
    openPrDetailMock.mockClear();
    useUiStore.setState({ selectedPrNumber: null, selectedPrKey: null });
    render(
      <>
        <WorkbenchPrRow prWithChecks={PR} />
        <WorkbenchPrRow prWithChecks={TWIN} />
      </>,
    );
  });

  afterEach(cleanup);

  it('selects and opens the PR (showPr) on click, at once', () => {
    fireEvent.click(row());
    expect(useUiStore.getState().selectedPrKey).toBe('acme/app#42');
    // The tab layout still reads the number.
    expect(useUiStore.getState().selectedPrNumber).toBe(42);
    expect(row()).toHaveAttribute('data-selected', 'true');
    expect(showPrMock).toHaveBeenCalledTimes(1);
    expect(showPrMock).toHaveBeenCalledWith(DETAIL);
    expect(openPrDetailMock).not.toHaveBeenCalled();
  });

  it('selects by owner/repo#number, so a same-numbered PR elsewhere stays unselected', () => {
    fireEvent.click(row());
    expect(row('acme/site#42')).not.toHaveAttribute('data-selected');
    fireEvent.click(row('acme/site#42'));
    expect(row('acme/site#42')).toHaveAttribute('data-selected', 'true');
    expect(row()).not.toHaveAttribute('data-selected');
  });

  it('opens the PR on Enter and Space from the focused row', () => {
    fireEvent.keyDown(row(), { key: 'Enter' });
    fireEvent.keyDown(row(), { key: ' ' });
    expect(showPrMock).toHaveBeenCalledTimes(2);
    expect(showPrMock).toHaveBeenCalledWith(DETAIL);
  });

  it('opens the pop-out on Ctrl+click and Cmd+click, and selects the row', () => {
    fireEvent.click(row(), { ctrlKey: true });
    fireEvent.click(row(), { metaKey: true });
    expect(openPrDetailMock).toHaveBeenCalledTimes(2);
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
    expect(row()).toHaveAttribute('data-selected', 'true');
  });

  it('opens the pop-out on Ctrl+Enter from the focused row', () => {
    fireEvent.keyDown(row(), { key: 'Enter', ctrlKey: true });
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('opens the pop-out on middle-click', () => {
    fireEvent(row(), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('ignores other auxiliary buttons', () => {
    fireEvent(row(), new MouseEvent('auxclick', { bubbles: true, button: 3 }));
    expect(openPrDetailMock).not.toHaveBeenCalled();
  });

  it('labels the row with its title and number', () => {
    expect(row()).toHaveAccessibleName('Add cool feature, #42');
  });

  it('opens the context menu on right-click, with "Open in window" in the Workbench layout', () => {
    const settings = useSettingsStore.getState().settings;
    act(() => {
      useSettingsStore.setState({
        settings: { ...settings, ui: { ...settings.ui, layoutV3: true } },
      });
    });
    fireEvent.contextMenu(row(), { clientX: 10, clientY: 10 });
    const item = screen.getByRole('menuitem', { name: 'Open in window' });
    fireEvent.click(item);
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    act(() => {
      useSettingsStore.setState({ settings });
    });
  });
});
