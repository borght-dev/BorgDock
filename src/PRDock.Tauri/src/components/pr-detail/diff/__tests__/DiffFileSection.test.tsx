import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DiffFileSection } from '../DiffFileSection';
import type { DiffFile, DiffViewMode } from '@/types';

vi.mock('@/services/diff-parser', () => ({
  parsePatch: vi.fn((patch: string) => {
    if (!patch) return [];
    return [
      {
        header: '@@ -1,3 +1,3 @@',
        oldStart: 1,
        oldCount: 3,
        newStart: 1,
        newCount: 3,
        lines: [
          { type: 'context', content: 'unchanged', oldLineNumber: 1, newLineNumber: 1 },
          { type: 'delete', content: 'old', oldLineNumber: 2 },
          { type: 'add', content: 'new', newLineNumber: 2 },
        ],
      },
    ];
  }),
  findLinePairs: vi.fn(() => new Map()),
  computeInlineChanges: vi.fn(() => null),
}));

vi.mock('@/hooks/useSyntaxHighlight', () => ({
  useSyntaxHighlight: vi.fn(() => null),
}));

vi.mock('@/services/syntax-highlighter', () => ({
  getHighlightClass: (category: string) => `--color-syntax-${category}`,
}));

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    filename: 'src/components/App.tsx',
    status: 'modified',
    additions: 10,
    deletions: 5,
    patch: '@@ -1,3 +1,3 @@\n-old\n+new\n ctx',
    isBinary: false,
    isTruncated: false,
    sha: 'abc123',
    ...overrides,
  };
}

function makeProps(overrides: Partial<{
  file: DiffFile;
  viewMode: DiffViewMode;
  defaultCollapsed: boolean;
  onCopyPath: (path: string) => void;
  onOpenInGitHub: (filename: string) => void;
}> = {}) {
  return {
    file: makeFile(),
    viewMode: 'unified' as DiffViewMode,
    onCopyPath: vi.fn(),
    ...overrides,
  };
}

describe('DiffFileSection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the filename in the header', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.getByTitle('src/components/App.tsx')).toBeDefined();
    expect(screen.getByText('src/components/App.tsx')).toBeDefined();
  });

  it('renders renamed file with arrow notation', () => {
    const file = makeFile({
      filename: 'new-name.ts',
      previousFilename: 'old-name.ts',
      status: 'renamed',
    });
    render(<DiffFileSection {...makeProps({ file })} />);
    expect(screen.getByText(/old-name\.ts/)).toBeDefined();
    expect(screen.getByText(/new-name\.ts/)).toBeDefined();
  });

  it('shows additions and deletions', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.getByText('+10')).toBeDefined();
    expect(screen.getByText('-5')).toBeDefined();
  });

  it('hides additions when zero', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ additions: 0 }) })} />);
    expect(screen.queryByText('+0')).toBeNull();
  });

  it('hides deletions when zero', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ deletions: 0 }) })} />);
    expect(screen.queryByText('-0')).toBeNull();
  });

  it('renders status badge M for modified files', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.getByText('M')).toBeDefined();
  });

  it('renders status badge A for added files', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ status: 'added' }) })} />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('renders status badge D for removed files', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ status: 'removed' }) })} />);
    expect(screen.getByText('D')).toBeDefined();
  });

  it('renders status badge R for renamed files', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ status: 'renamed' }) })} />);
    expect(screen.getByText('R')).toBeDefined();
  });

  it('renders status badge C for copied files', () => {
    render(<DiffFileSection {...makeProps({ file: makeFile({ status: 'copied' }) })} />);
    expect(screen.getByText('C')).toBeDefined();
  });

  it('renders copy path button', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.getByTitle('Copy file path')).toBeDefined();
  });

  it('calls onCopyPath when copy button clicked', () => {
    const props = makeProps();
    render(<DiffFileSection {...props} />);
    fireEvent.click(screen.getByTitle('Copy file path'));
    expect(props.onCopyPath).toHaveBeenCalledWith('src/components/App.tsx');
  });

  it('renders open in GitHub button when callback provided', () => {
    const onOpenInGitHub = vi.fn();
    render(<DiffFileSection {...makeProps({ onOpenInGitHub })} />);
    expect(screen.getByTitle('Open in GitHub')).toBeDefined();
  });

  it('does not render open in GitHub button when callback is undefined', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.queryByTitle('Open in GitHub')).toBeNull();
  });

  it('calls onOpenInGitHub when GitHub button clicked', () => {
    const onOpenInGitHub = vi.fn();
    render(<DiffFileSection {...makeProps({ onOpenInGitHub })} />);
    fireEvent.click(screen.getByTitle('Open in GitHub'));
    expect(onOpenInGitHub).toHaveBeenCalledWith('src/components/App.tsx');
  });

  it('starts expanded by default', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    // Should render diff content (table)
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    const { container } = render(
      <DiffFileSection {...makeProps({ defaultCollapsed: true })} />,
    );
    expect(container.querySelector('table')).toBeNull();
  });

  it('collapses and expands when clicking the toggle button', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    // Initially expanded
    expect(container.querySelector('table')).not.toBeNull();

    // Click collapse
    fireEvent.click(screen.getByLabelText('Collapse'));
    expect(container.querySelector('table')).toBeNull();

    // Click expand
    fireEvent.click(screen.getByLabelText('Expand'));
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('shows binary file message', () => {
    render(
      <DiffFileSection
        {...makeProps({ file: makeFile({ isBinary: true, patch: undefined }) })}
      />,
    );
    expect(screen.getByText('Binary file not shown')).toBeDefined();
  });

  it('shows truncated file message', () => {
    render(
      <DiffFileSection
        {...makeProps({ file: makeFile({ isTruncated: true, patch: undefined }) })}
      />,
    );
    expect(screen.getByText('Diff too large to display inline')).toBeDefined();
  });

  it('shows "no changes" for files with no patch', () => {
    render(
      <DiffFileSection
        {...makeProps({ file: makeFile({ patch: undefined }) })}
      />,
    );
    expect(screen.getByText('No changes to display')).toBeDefined();
  });

  it('shows renamed without changes message for renamed files with no patch', () => {
    render(
      <DiffFileSection
        {...makeProps({
          file: makeFile({ status: 'renamed', patch: undefined }),
        })}
      />,
    );
    expect(screen.getByText('File renamed without changes')).toBeDefined();
  });

  it('renders unified view when viewMode is unified', () => {
    const { container } = render(<DiffFileSection {...makeProps({ viewMode: 'unified' })} />);
    const table = container.querySelector('table');
    // Unified view has 3 columns
    const cols = table?.querySelectorAll('col');
    expect(cols?.length).toBe(3);
  });

  it('renders split view when viewMode is split', () => {
    const { container } = render(<DiffFileSection {...makeProps({ viewMode: 'split' })} />);
    const table = container.querySelector('table');
    // Split view has 4 columns
    const cols = table?.querySelectorAll('col');
    expect(cols?.length).toBe(4);
  });

  it('sets data-filename attribute on root element', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('data-filename')).toBe('src/components/App.tsx');
  });

  it('renders collapse toggle with aria-label', () => {
    render(<DiffFileSection {...makeProps()} />);
    expect(screen.getByLabelText('Collapse')).toBeDefined();
  });

  it('renders expand toggle with aria-label when collapsed', () => {
    render(<DiffFileSection {...makeProps({ defaultCollapsed: true })} />);
    expect(screen.getByLabelText('Expand')).toBeDefined();
  });
});
