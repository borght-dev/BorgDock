import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, DiffViewMode } from '@/types';
import { DiffFileSection } from '../DiffFileSection';

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

function makeProps(
  overrides: Partial<{
    file: DiffFile;
    viewMode: DiffViewMode;
    defaultCollapsed: boolean;
    onCopyPath: (path: string) => void;
    onOpenInGitHub: (filename: string) => void;
  }> = {},
) {
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
    const { container } = render(<DiffFileSection {...makeProps({ defaultCollapsed: true })} />);
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
      <DiffFileSection {...makeProps({ file: makeFile({ isBinary: true, patch: undefined }) })} />,
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
    render(<DiffFileSection {...makeProps({ file: makeFile({ patch: undefined }) })} />);
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

  it('renders data-diff-file on the file root', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    expect(container.querySelector('[data-diff-file]')).not.toBeNull();
  });

  it('renders data-diff-stat="added" with the additions count', () => {
    const { container } = render(
      <DiffFileSection
        {...makeProps({ file: makeFile({ additions: 42, deletions: 5 }) })}
      />,
    );
    const added = container.querySelector('[data-diff-stat="added"]');
    expect(added).not.toBeNull();
    expect(added?.textContent).toContain('42');
  });

  it('renders data-diff-stat="deleted" with the deletions count', () => {
    const { container } = render(
      <DiffFileSection
        {...makeProps({ file: makeFile({ additions: 42, deletions: 5 }) })}
      />,
    );
    const deleted = container.querySelector('[data-diff-stat="deleted"]');
    expect(deleted).not.toBeNull();
    expect(deleted?.textContent).toContain('5');
  });

  it('renders prev/next hunk IconButtons with data-action', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    expect(container.querySelector('[data-action="prev-hunk"]')).not.toBeNull();
    expect(container.querySelector('[data-action="next-hunk"]')).not.toBeNull();
  });

  it('scrolls to next hunk when next-hunk button is clicked', () => {
    const { container } = render(<DiffFileSection {...makeProps()} />);
    // Inject a fake hunk-header element so the handler has something to find.
    // Task 9 will add real [data-hunk-header] markers to UnifiedDiffView/SplitDiffView.
    const fakeHeader = document.createElement('div');
    fakeHeader.setAttribute('data-hunk-header', '');
    fakeHeader.textContent = '@@ -1,3 +1,3 @@';
    container.querySelector('[data-diff-file]')?.appendChild(fakeHeader);

    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const nextBtn = container.querySelector('[data-action="next-hunk"]') as HTMLButtonElement;
    nextBtn.click();

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});

describe('DiffFileSection — pre-parsed hunks', () => {
  it('uses provided hunks instead of parsing patch when both are present', () => {
    const file: DiffFile = {
      filename: 'a.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      isBinary: false,
      isTruncated: false,
      sha: '',
      hunks: [
        {
          header: '@@ -1,1 +1,2 @@',
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 2,
          lines: [
            { type: 'hunk-header', content: '@@ -1,1 +1,2 @@' },
            { type: 'context', content: 'a', oldLineNumber: 1, newLineNumber: 1 },
            { type: 'add', content: 'b', newLineNumber: 2 },
          ],
        },
      ],
      // intentionally provide a *bogus* patch string to prove pre-parsed hunks
      // win when present:
      patch: 'this would never parse correctly',
    };
    render(
      <DiffFileSection
        file={file}
        viewMode="unified"
        onCopyPath={() => {}}
      />,
    );
    expect(screen.getByText('@@ -1,1 +1,2 @@')).toBeInTheDocument();
  });
});
