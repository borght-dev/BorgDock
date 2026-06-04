import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePaletteResultsList } from '../FilePaletteResultsList';

const results = [
  { rel_path: 'src/footer.tsx', mode: 'filename' as const },
  { rel_path: 'src/header.tsx', mode: 'filename' as const },
];

describe('FilePaletteResultsList data-* contract', () => {
  it('renders [data-file-result] on each row', () => {
    const { container } = render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={vi.fn()}
        onOpen={vi.fn()}
        onCopyPath={vi.fn()}
        rowRef={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[data-file-result]').length).toBe(2);
  });
  it('marks the selected row with [data-selected="true"]', () => {
    const { container } = render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={vi.fn()}
        onOpen={vi.fn()}
        onCopyPath={vi.fn()}
        rowRef={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-file-result][data-selected="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-file-result][data-selected="true"]').length).toBe(1);
  });
});

describe('FilePaletteResultsList click + context-menu behavior', () => {
  it('single click selects the row (onHover) without opening a window', () => {
    const onHover = vi.fn();
    const onOpen = vi.fn();
    render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={onHover}
        onOpen={onOpen}
        onCopyPath={vi.fn()}
        rowRef={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src/header.tsx'));
    expect(onHover).toHaveBeenCalledWith(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('double click opens the row in a window (onOpen)', () => {
    const onOpen = vi.fn();
    render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={vi.fn()}
        onOpen={onOpen}
        onCopyPath={vi.fn()}
        rowRef={vi.fn()}
      />,
    );
    fireEvent.doubleClick(screen.getByText('src/footer.tsx'));
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it('right-click fires onContextMenu with the row index, rel_path, and coords', () => {
    const onContextMenu = vi.fn();
    render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={vi.fn()}
        onOpen={vi.fn()}
        onCopyPath={vi.fn()}
        onContextMenu={onContextMenu}
        rowRef={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText('src/header.tsx'), { clientX: 5, clientY: 7 });
    expect(onContextMenu).toHaveBeenCalledWith(1, 'src/header.tsx', 5, 7);
  });
});

describe('FilePaletteResultsList copy-path button', () => {
  it('copies the row rel_path (not the absolute path) and does not open the file', () => {
    const onCopyPath = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <FilePaletteResultsList
        results={results}
        selectedIndex={0}
        onHover={vi.fn()}
        onOpen={onOpen}
        onCopyPath={onCopyPath}
        rowRef={vi.fn()}
      />,
    );
    const copyButtons = container.querySelectorAll('[data-copy-path]');
    expect(copyButtons.length).toBe(2);
    fireEvent.click(copyButtons[1]!);
    expect(onCopyPath).toHaveBeenCalledWith('src/header.tsx');
    // Copying must not trigger the row's open handler.
    expect(onOpen).not.toHaveBeenCalled();
  });
});
