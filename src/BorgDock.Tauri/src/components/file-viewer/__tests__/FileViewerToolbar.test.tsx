import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}));

import { FileViewerToolbar } from '../FileViewerToolbar';

const baseProps = {
  path: 'src/quote/footer.tsx',
  content: 'console.log("hello")',
  mode: 'content' as const,
  baseline: 'HEAD' as const,
  onSelectBaseline: vi.fn(),
  onSelectContent: vi.fn(),
  viewMode: 'unified' as const,
  onSelectViewMode: vi.fn(),
  inRepo: true,
  defaultBranchLabel: 'main',
};

describe('FileViewerToolbar', () => {
  it('renders the path with data-titlebar-path', () => {
    render(<FileViewerToolbar {...baseProps} />);
    const path = document.querySelector('[data-titlebar-path]');
    expect(path).not.toBeNull();
    expect(path?.textContent).toContain('footer.tsx');
  });

  it('copy button carries data-action="copy-contents"', () => {
    render(<FileViewerToolbar {...baseProps} />);
    expect(document.querySelector('[data-action="copy-contents"]')).not.toBeNull();
  });

  it('renders three baseline Chips and a Unified / Split segmented control in diff mode', () => {
    const onSelectViewMode = vi.fn();
    render(<FileViewerToolbar {...baseProps} mode="diff" onSelectViewMode={onSelectViewMode} />);
    // bd-chip is the Chip primitive class; verify with cat src/components/shared/primitives/Chip.tsx
    expect(document.querySelectorAll('.bd-chip').length).toBe(3);
    const layout = screen.getByRole('group', { name: 'Diff layout' });
    expect(layout.querySelector('.bd-slide__hl')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSelectViewMode).toHaveBeenCalledWith('split');
  });

  it('hides the diff layout control outside diff mode', () => {
    render(<FileViewerToolbar {...baseProps} />);
    expect(screen.queryByRole('group', { name: 'Diff layout' })).toBeNull();
  });
});
