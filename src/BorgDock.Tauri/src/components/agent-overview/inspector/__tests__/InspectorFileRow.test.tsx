import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { InspectorFileRow } from '../InspectorFileRow';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

const file = {
  path: 'src/foo.ts', tool: 'edit' as const, timestampMs: 0,
  additions: 5, deletions: 2, status: 'modified' as const,
};

function Harness() {
  const cache = useRef(new Map());
  return <InspectorFileRow cwd="C:/x" file={file} cache={cache} />;
}

describe('InspectorFileRow', () => {
  it('does not fetch the diff until expanded', () => {
    invokeMock.mockClear();
    render(<Harness />);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('fetches on first expand and caches on the second', async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValue({ hunks: [{ header: '@@ ... @@', lines: [{ kind: 'add', content: '+ x' }] }] });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('diff_worktree_vs_head', {
        worktreePath: 'C:/x', filePath: 'src/foo.ts',
      });
    });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('renders "no preview" when the diff comes back empty', async () => {
    invokeMock.mockClear();
    invokeMock.mockResolvedValue({ hunks: [] });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText(/no preview/i)).toBeInTheDocument();
    });
  });
});
