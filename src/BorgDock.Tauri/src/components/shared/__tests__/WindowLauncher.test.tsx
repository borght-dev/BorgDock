import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowLauncher } from '../WindowLauncher';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve()) }));

describe('WindowLauncher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists every context-free app window', () => {
    render(<WindowLauncher />);
    fireEvent.click(screen.getByRole('button', { name: 'Open window' }));

    for (const label of ['Worktrees', 'Files', 'Work items', 'SQL', 'Settings', "What's new"]) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it.each([
    ['Worktrees', 'worktrees'],
    ['Files', 'files'],
    ['Work items', 'work-items'],
    ['SQL', 'sql'],
  ])('opens %s through the shared native launcher', async (label, tool) => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<WindowLauncher />);
    fireEvent.click(screen.getByRole('button', { name: 'Open window' }));
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}`, 'i') }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('open_tool_window', { tool }));
  });

  it('opens settings directly and reports completion', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const onWindowOpened = vi.fn();
    render(<WindowLauncher onWindowOpened={onWindowOpened} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open window' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('open_settings_window', { section: null });
      expect(onWindowOpened).toHaveBeenCalledOnce();
    });
  });
});
