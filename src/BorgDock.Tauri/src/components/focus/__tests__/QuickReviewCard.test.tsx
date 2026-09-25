import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApproveButton, ciNote, QuickReviewCard } from '../QuickReviewCard';
import { makePr, resetSeq } from './helpers';

// Mock react-markdown to render children as plain text
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: {},
}));

afterEach(cleanup);

const FILES = [
  'src/services/a.ts',
  'src/services/b.ts',
  'src/components/pr/Row.tsx',
  'README.md',
  'bun.lock',
  'src/generated/changelog.ts',
];

function card(overrides: Parameters<typeof makePr>[0] = {}, reviewed: string[] = []) {
  const pr = makePr(overrides);
  return render(
    <QuickReviewCard pr={pr} files={FILES} reviewed={reviewed} actions={<button>Act</button>} />,
  );
}

describe('QuickReviewCard', () => {
  beforeEach(() => {
    resetSeq();
  });

  it('renders the title, author, repository and number', () => {
    const { container } = card({
      title: 'Fix critical bug',
      authorLogin: 'johndoe',
      repoOwner: 'acme',
      repoName: 'widget',
      number: 42,
    });
    expect(container.querySelector('[data-pr-title]')?.textContent).toBe('Fix critical bug');
    expect(screen.getByText('johndoe')).toBeInTheDocument();
    expect(screen.getByText('acme/widget')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Pull request #42' })).toBeInTheDocument();
  });

  it('shows branch, size and lines', () => {
    card({
      headRef: 'feature/login',
      baseRef: 'develop',
      additions: 100,
      deletions: 50,
      changedFiles: 8,
      commitCount: 1,
    });
    expect(screen.getByText('feature/login')).toBeInTheDocument();
    expect(screen.getByText('into develop')).toBeInTheDocument();
    expect(screen.getByText('8 files')).toBeInTheDocument();
    expect(screen.getByText('1 commit')).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();
    expect(screen.getByText('−50')).toBeInTheDocument();
  });

  it('counts files per folder, biggest first, with generated files pooled last', () => {
    card();
    const folders = within(screen.getByRole('region', { name: 'Files by folder' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(folders).toEqual(['src/services2', '/1', 'src/components/pr1', 'generated2']);
    const generated = screen.getByText('generated').closest('li');
    expect(generated).toHaveAttribute('data-generated', 'true');
  });

  it('says how many files are left to review, excluding generated ones', () => {
    const { rerender } = card({}, ['src/services/a.ts', 'bun.lock']);
    expect(screen.getByText('3 of 4 to review, 2 generated')).toBeInTheDocument();
    rerender(
      <QuickReviewCard
        pr={makePr()}
        files={FILES}
        reviewed={FILES.filter((f) => !f.includes('generated') && f !== 'bun.lock')}
        actions={null}
      />,
    );
    expect(screen.getByText('0 of 4 to review, 2 generated')).toBeInTheDocument();
  });

  it('shows a loading line until the files arrive', () => {
    render(<QuickReviewCard pr={makePr()} files={null} reviewed={[]} actions={null} />);
    expect(screen.getByText('Loading changed files…')).toBeInTheDocument();
  });

  it('draws the checks with a one-line CI note', () => {
    const pr = {
      ...makePr(),
      failedCheckNames: ['build'],
      passedCount: 5,
      totalCheckCount: 6,
    };
    render(<QuickReviewCard pr={pr} files={[]} reviewed={[]} actions={null} />);
    expect(screen.getByText('1 failing')).toBeInTheDocument();
    expect(screen.getByText('CI is failing, review can wait')).toBeInTheDocument();
  });

  it.each([
    [{ failed: 0, pending: 1, passed: 3, total: 4 }, 'CI still running'],
    [{ failed: 0, pending: 0, passed: 4, total: 4 }, 'nothing blocking on CI'],
    [{ failed: 0, pending: 0, passed: 0, total: 0 }, 'no checks on this PR'],
  ])('CI note for %o is "%s"', (c, note) => {
    const pr = {
      ...makePr(),
      failedCheckNames: Array.from({ length: c.failed }, (_, i) => `f${i}`),
      pendingCheckNames: Array.from({ length: c.pending }, (_, i) => `p${i}`),
      passedCount: c.passed,
      totalCheckCount: c.total,
    };
    expect(ciNote(pr)).toBe(note);
  });

  it('clamps a long description behind Show more', () => {
    card({ body: `## Changes\n\n${'A long line of description. '.repeat(20)}` });
    expect(screen.getByTestId('markdown').textContent).toContain('## Changes');
    const more = screen.getByRole('button', { name: 'Show more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('says so when there is no description', () => {
    card({ body: '' });
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  it('replaces the summary with a custom body (the composer)', () => {
    render(
      <QuickReviewCard
        pr={makePr()}
        files={FILES}
        reviewed={[]}
        body={<p>Composer</p>}
        actions={null}
      />,
    );
    expect(screen.getByText('Composer')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Files by folder' })).toBeNull();
  });
});

describe('ApproveButton', () => {
  it('stays focusable while blocked, ignores clicks and points at the reason', () => {
    const onApprove = vi.fn();
    render(
      <>
        <ApproveButton
          issue="3 files not reviewed yet"
          busy={false}
          onApprove={onApprove}
          reasonId="why"
        />
        <p id="why">3 files not reviewed yet</p>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Approve' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onApprove).not.toHaveBeenCalled();
    expect(button).toHaveAccessibleDescription('3 files not reviewed yet');
    // The hover tooltip repeats the reason without being read twice.
    expect(document.querySelector('.qr-tip')).toHaveAttribute('aria-hidden', 'true');
  });

  it('approves when nothing blocks it', () => {
    const onApprove = vi.fn();
    render(<ApproveButton issue={null} busy={false} onApprove={onApprove} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    expect(button).not.toHaveAttribute('aria-disabled');
    fireEvent.click(button);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.qr-tip')).toBeNull();
  });
});
