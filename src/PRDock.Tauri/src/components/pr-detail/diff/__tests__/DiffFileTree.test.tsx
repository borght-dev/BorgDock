import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DiffFileTree } from '../DiffFileTree';
import type { DiffFile, FileStatusFilter } from '@/types';

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    filename: 'src/components/App.tsx',
    status: 'modified',
    additions: 10,
    deletions: 5,
    isBinary: false,
    isTruncated: false,
    sha: 'abc123',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof DiffFileTree>[0]> = {}) {
  return {
    files: [
      makeFile({ filename: 'src/App.tsx', status: 'modified', additions: 10, deletions: 5 }),
      makeFile({ filename: 'src/index.ts', status: 'added', additions: 20, deletions: 0 }),
      makeFile({ filename: 'src/old.ts', status: 'removed', additions: 0, deletions: 15 }),
    ],
    activeFile: null as string | null,
    statusFilter: 'all' as FileStatusFilter,
    onFileClick: vi.fn(),
    ...overrides,
  };
}

describe('DiffFileTree', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all files in the list', () => {
    render(<DiffFileTree {...makeProps()} />);
    expect(screen.getByText('App.tsx')).toBeDefined();
    expect(screen.getByText('index.ts')).toBeDefined();
    expect(screen.getByText('old.ts')).toBeDefined();
  });

  it('displays search input with placeholder', () => {
    render(<DiffFileTree {...makeProps()} />);
    expect(screen.getByPlaceholderText('Filter files...')).toBeDefined();
  });

  it('filters files by search query', () => {
    render(<DiffFileTree {...makeProps()} />);
    const input = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(input, { target: { value: 'App' } });
    expect(screen.getByText('App.tsx')).toBeDefined();
    expect(screen.queryByText('index.ts')).toBeNull();
    expect(screen.queryByText('old.ts')).toBeNull();
  });

  it('calls onFileClick when a file is clicked', () => {
    const props = makeProps();
    render(<DiffFileTree {...props} />);
    fireEvent.click(screen.getByText('App.tsx'));
    expect(props.onFileClick).toHaveBeenCalledWith('src/App.tsx');
  });

  it('highlights active file', () => {
    const props = makeProps({ activeFile: 'src/App.tsx' });
    render(<DiffFileTree {...props} />);
    const button = screen.getByTitle('src/App.tsx');
    expect(button.className).toContain('bg-[var(--color-selected-row-bg)]');
  });

  it('shows status badge M for modified files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', status: 'modified' })] })} />);
    expect(screen.getByText('M')).toBeDefined();
  });

  it('shows status badge A for added files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', status: 'added' })] })} />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('shows status badge D for removed files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', status: 'removed' })] })} />);
    expect(screen.getByText('D')).toBeDefined();
  });

  it('shows status badge R for renamed files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', status: 'renamed' })] })} />);
    expect(screen.getByText('R')).toBeDefined();
  });

  it('shows status badge C for copied files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', status: 'copied' })] })} />);
    expect(screen.getByText('C')).toBeDefined();
  });

  it('shows additions and deletions per file', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', additions: 7, deletions: 3 })] })} />);
    // Both file row and summary show the same numbers, so expect 2 of each
    expect(screen.getAllByText('+7').length).toBe(2);
    expect(screen.getAllByText('-3').length).toBe(2);
  });

  it('hides additions when zero', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', additions: 0, deletions: 3 })] })} />);
    // +0 should not appear in the file row
    const greens = screen.queryAllByText('+0');
    expect(greens.length).toBe(1); // only in summary
    expect(screen.getAllByText('-3').length).toBe(2);
  });

  it('hides deletions when zero', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'a.ts', additions: 5, deletions: 0 })] })} />);
    expect(screen.getAllByText('+5').length).toBe(2);
    // -0 should not appear in the file row
    const reds = screen.queryAllByText('-0');
    expect(reds.length).toBe(1); // only in summary
  });

  it('shows summary with total file count and stats', () => {
    const props = makeProps();
    render(<DiffFileTree {...props} />);
    expect(screen.getByText(/3 files/)).toBeDefined();
    expect(screen.getByText('+30')).toBeDefined();
    expect(screen.getByText('-20')).toBeDefined();
  });

  it('shows singular "file" for 1 file', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile()] })} />);
    expect(screen.getByText(/1 file,/)).toBeDefined();
  });

  it('filters by added status', () => {
    render(<DiffFileTree {...makeProps({ statusFilter: 'added' })} />);
    expect(screen.queryByText('App.tsx')).toBeNull();
    expect(screen.getByText('index.ts')).toBeDefined();
    expect(screen.queryByText('old.ts')).toBeNull();
  });

  it('filters by modified status (includes renamed and copied)', () => {
    const files = [
      makeFile({ filename: 'a.ts', status: 'modified' }),
      makeFile({ filename: 'b.ts', status: 'renamed' }),
      makeFile({ filename: 'c.ts', status: 'copied' }),
      makeFile({ filename: 'd.ts', status: 'added' }),
    ];
    render(<DiffFileTree {...makeProps({ files, statusFilter: 'modified' })} />);
    expect(screen.getByText('a.ts')).toBeDefined();
    expect(screen.getByText('b.ts')).toBeDefined();
    expect(screen.getByText('c.ts')).toBeDefined();
    expect(screen.queryByText('d.ts')).toBeNull();
  });

  it('filters by deleted status', () => {
    render(<DiffFileTree {...makeProps({ statusFilter: 'deleted' })} />);
    expect(screen.queryByText('App.tsx')).toBeNull();
    expect(screen.queryByText('index.ts')).toBeNull();
    expect(screen.getByText('old.ts')).toBeDefined();
  });

  it('shows directory path in flat mode', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'src/components/App.tsx' })] })} />);
    expect(screen.getByText('src/components')).toBeDefined();
  });

  it('toggles tree mode button', () => {
    render(<DiffFileTree {...makeProps()} />);
    const toggleBtn = screen.getByTitle('Tree view');
    expect(toggleBtn).toBeDefined();
    fireEvent.click(toggleBtn);
    expect(screen.getByTitle('Flat list')).toBeDefined();
  });

  it('shows extension icons for known types', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'src/app.tsx' })] })} />);
    expect(screen.getByText('TX')).toBeDefined();
  });

  it('shows extension icon for .ts files', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'main.ts' })] })} />);
    expect(screen.getByText('TS')).toBeDefined();
  });

  it('shows fallback icon for unknown extensions', () => {
    render(<DiffFileTree {...makeProps({ files: [makeFile({ filename: 'data.xyz' })] })} />);
    expect(screen.getByText('XY')).toBeDefined();
  });

  it('combines search and status filter', () => {
    const files = [
      makeFile({ filename: 'src/App.tsx', status: 'added' }),
      makeFile({ filename: 'src/Button.tsx', status: 'added' }),
      makeFile({ filename: 'src/index.ts', status: 'modified' }),
    ];
    render(<DiffFileTree {...makeProps({ files, statusFilter: 'added' })} />);
    const input = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(input, { target: { value: 'Button' } });
    expect(screen.getByText('Button.tsx')).toBeDefined();
    expect(screen.queryByText('App.tsx')).toBeNull();
    expect(screen.queryByText('index.ts')).toBeNull();
  });
});
