import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangesSection } from '../ChangesSection';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

type InvokeMock = (cmd: string, args?: unknown) => Promise<unknown>;

async function setInvoke(impl: InvokeMock) {
  const { invoke } = await import('@tauri-apps/api/core');
  (invoke as ReturnType<typeof vi.fn>).mockImplementation(impl);
}

const BASE_PROPS = {
  rootPath: 'E:/repo',
  query: '',
  queryMode: 'filename' as const,
  selectedGlobalIndex: -1,
  baseIndex: 0,
  onOpen: vi.fn(),
  onHover: vi.fn(),
  localCollapsed: false,
  vsBaseCollapsed: false,
  onToggleCollapse: vi.fn(),
  refreshTick: 0,
};

describe('ChangesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Local and vs-base rows when in a git repo', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [{ path: 'src/foo.ts', status: 'M', oldPath: null }],
        vsBase: [{ path: 'src/bar.ts', status: 'A', oldPath: null }],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('src/foo.ts')).toBeTruthy());
    expect(screen.getByText('src/bar.ts')).toBeTruthy();
    expect(screen.getByText(/Local/)).toBeTruthy();
    expect(screen.getByText(/vs master/)).toBeTruthy();
  });

  it('filters rows by filename query (case-insensitive substring)', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [
          { path: 'src/Foo.ts', status: 'M', oldPath: null },
          { path: 'src/bar.ts', status: 'M', oldPath: null },
        ],
        vsBase: [],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    render(<ChangesSection {...BASE_PROPS} query="foo" />);
    await waitFor(() => expect(screen.getByText('src/Foo.ts')).toBeTruthy());
    expect(screen.queryByText('src/bar.ts')).toBeNull();
  });

  it('shows "Not a git repo" when inRepo is false', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: '', inRepo: false }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/Not a git repo/)).toBeTruthy());
  });

  it('shows "No changes" when lists are empty', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: 'master', inRepo: true }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/No changes on this branch/)).toBeTruthy());
  });

  it('calls onOpen with the correct group when a row is clicked', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [{ path: 'src/foo.ts', status: 'M', oldPath: null }],
        vsBase: [{ path: 'src/bar.ts', status: 'A', oldPath: null }],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    const onOpen = vi.fn();
    render(<ChangesSection {...BASE_PROPS} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByText('src/foo.ts')).toBeTruthy());
    fireEvent.click(screen.getByText('src/foo.ts'));
    expect(onOpen).toHaveBeenCalledWith(
      { path: 'src/foo.ts', status: 'M', oldPath: null },
      'local',
    );
    fireEvent.click(screen.getByText('src/bar.ts'));
    expect(onOpen).toHaveBeenCalledWith(
      { path: 'src/bar.ts', status: 'A', oldPath: null },
      'vsBase',
    );
  });

  it('refetches when refreshTick changes', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'master', inRepo: true });

    const { rerender } = render(<ChangesSection {...BASE_PROPS} refreshTick={0} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));

    rerender(<ChangesSection {...BASE_PROPS} refreshTick={1} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });
});
