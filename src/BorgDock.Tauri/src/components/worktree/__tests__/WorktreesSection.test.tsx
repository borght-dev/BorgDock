import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { WorktreesSection } from '../WorktreesSection';

describe('WorktreesSection', () => {
  it('explains where worktrees live and names the shortcut', () => {
    render(<WorktreesSection />);
    expect(screen.getByRole('heading', { name: 'Worktrees' })).toBeInTheDocument();
    expect(screen.getByText('Ctrl+F7')).toBeInTheDocument();
  });

  it('opens the worktrees tool window', () => {
    render(<WorktreesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Open worktrees window' }));
    expect(invoke).toHaveBeenCalledWith('open_tool_window', { tool: 'worktrees' });
  });
});
