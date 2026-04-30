import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePaletteChangesSection } from '../FilePaletteChangesSection';

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
  collapsed: false,
  mode: 'both' as const,
  onToggleCollapse: vi.fn(),
  onChangeMode: vi.fn(),
  refreshTick: 0,
};

describe('FilePaletteChangesSection', () => {
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
    render(<FilePaletteChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('src/foo.ts')).toBeTruthy());
    expect(screen.getByText('src/bar.ts')).toBeTruthy();
    // Group labels are now non-interactive divs, not buttons.
    expect(screen.getByText(/Local · uncommitted/)).toBeTruthy();
    // Scope to the group label's sub-text — "vs master" also appears in the
    // header mode-switcher button, which would otherwise match too.
    expect(
      screen.getByText(/vs master/, { selector: '.bd-fp-changes-group-sub' }),
    ).toBeTruthy();
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
    render(<FilePaletteChangesSection {...BASE_PROPS} query="foo" />);
    await waitFor(() => expect(screen.getByText('src/Foo.ts')).toBeTruthy());
    expect(screen.queryByText('src/bar.ts')).toBeNull();
  });

  it('shows "Not a git repo" when inRepo is false', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: '', inRepo: false }),
    );
    render(<FilePaletteChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/Not a git repo/)).toBeTruthy());
  });

  it('shows "No changes" when lists are empty', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: 'master', inRepo: true }),
    );
    render(<FilePaletteChangesSection {...BASE_PROPS} />);
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
    render(<FilePaletteChangesSection {...BASE_PROPS} onOpen={onOpen} />);
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

    const { rerender } = render(<FilePaletteChangesSection {...BASE_PROPS} refreshTick={0} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));

    rerender(<FilePaletteChangesSection {...BASE_PROPS} refreshTick={1} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });
});

describe('FilePaletteChangesSection bd-fp-* class contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows with bd-fp-changes-row class and applies --selected when global index matches', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [{ path: 'src/foo.ts', status: 'M', oldPath: null }],
        vsBase: [],
        baseRef: 'main',
        inRepo: true,
      }),
    );
    const { container } = render(
      <FilePaletteChangesSection {...BASE_PROPS} selectedGlobalIndex={0} baseIndex={0} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('.bd-fp-changes-row').length).toBeGreaterThanOrEqual(1);
      expect(container.querySelector('.bd-fp-changes-row--selected')).not.toBeNull();
    });
  });

  it('shows only local rows when mode is "head"', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 2, deletions: 1 }],
      vsBase: [{ path: 'b.ts', status: 'A', additions: 5, deletions: 0 }],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...BASE_PROPS} mode="head" />);
    await waitFor(() => expect(screen.queryByText('a.ts')).toBeInTheDocument());
    expect(screen.queryByText('b.ts')).toBeNull();
  });

  it('renders +N −N per row using ChangedFileEntry stats', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 14, deletions: 6 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...BASE_PROPS} mode="both" />);
    // Both the header summary and the per-row stat render +14 / −6 (only
    // one file, so totals match the row). Scope to the per-row class so the
    // assertion verifies the row stats specifically.
    await waitFor(() =>
      expect(
        screen.getByText('+14', { selector: '.bd-fp-changes-row__add' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText('−6', { selector: '.bd-fp-changes-row__del' }),
    ).toBeInTheDocument();
  });

  it('hides rows when collapsed=true but keeps the section header', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 1, deletions: 0 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...BASE_PROPS} collapsed={true} />);
    expect(await screen.findByText(/CHANGES/i)).toBeInTheDocument();
    expect(screen.queryByText('a.ts')).toBeNull();
  });
});
