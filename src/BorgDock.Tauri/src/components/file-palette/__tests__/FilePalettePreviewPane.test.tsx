import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilePalettePreviewPane } from '../FilePalettePreviewPane';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

afterEach(() => invokeMock.mockReset());

describe('FilePalettePreviewPane routing', () => {
  it('routes diff selection to DiffPreview', async () => {
    invokeMock.mockResolvedValue({ patch: '', baselineRef: 'HEAD', inRepo: true });
    render(
      <FilePalettePreviewPane
        rootPath="/r"
        selection={{ kind: 'diff', source: 'changes', path: 'a.ts', baseline: 'HEAD', group: 'local' }}
        contentHit={null}
        onIdentifierJump={() => {}}
        onPopOut={() => {}}
      />,
    );
    expect(await screen.findByText(/vs HEAD/i)).toBeInTheDocument();
  });

  it('routes file selection to FilePreview', async () => {
    invokeMock.mockResolvedValue('hello');
    render(
      <FilePalettePreviewPane
        rootPath="/r"
        selection={{ kind: 'file', source: 'results', path: 'a.ts' }}
        contentHit={null}
        onIdentifierJump={() => {}}
        onPopOut={() => {}}
      />,
    );
    // FilePreview's chrome renders an ext pill or filename; assert via path text.
    expect(await screen.findByText(/a\.ts/)).toBeInTheDocument();
  });

  it('Open in window calls onPopOut with current path (file mode)', async () => {
    invokeMock.mockResolvedValue('hello');
    const onPopOut = vi.fn();
    render(
      <FilePalettePreviewPane
        rootPath="/r"
        selection={{ kind: 'file', source: 'results', path: 'a.ts' }}
        contentHit={null}
        onIdentifierJump={() => {}}
        onPopOut={onPopOut}
      />,
    );
    fireEvent.click(await screen.findByLabelText(/Open in window/i));
    expect(onPopOut).toHaveBeenCalledWith(expect.stringContaining('a.ts'), undefined);
  });
});
