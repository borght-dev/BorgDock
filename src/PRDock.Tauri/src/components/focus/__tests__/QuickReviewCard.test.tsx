import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickReviewCard } from '../QuickReviewCard';
import { makePr, resetSeq } from './helpers';

// Mock react-markdown to render children as plain text
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: {},
}));

afterEach(cleanup);

describe('QuickReviewCard', () => {
  beforeEach(() => {
    resetSeq();
  });

  it('renders the PR title', () => {
    const pr = makePr({ title: 'Fix critical bug' });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('Fix critical bug')).toBeDefined();
  });

  it('renders repo owner/name and PR number', () => {
    const pr = makePr({ repoOwner: 'acme', repoName: 'widget', number: 42 });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('acme/widget')).toBeDefined();
    expect(screen.getAllByText('#42').length).toBeGreaterThanOrEqual(1);
  });

  it('renders author login', () => {
    const pr = makePr({ authorLogin: 'johndoe' });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('by johndoe')).toBeDefined();
  });

  it('renders branch flow (head -> base)', () => {
    const pr = makePr({ headRef: 'feature/login', baseRef: 'develop' });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('feature/login')).toBeDefined();
    expect(screen.getByText('develop')).toBeDefined();
    expect(screen.getByText('\u2192')).toBeDefined();
  });

  it('renders stats with additions, deletions, files, and commits', () => {
    const pr = makePr({
      additions: 100,
      deletions: 50,
      changedFiles: 8,
      commitCount: 3,
    });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('+100')).toBeDefined();
    expect(screen.getByText('-50')).toBeDefined();
    expect(screen.getByText('8 files')).toBeDefined();
    expect(screen.getByText('3 commits')).toBeDefined();
  });

  it('uses singular "file" for 1 changed file', () => {
    const pr = makePr({ changedFiles: 1 });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('1 file')).toBeDefined();
  });

  it('uses singular "commit" for 1 commit', () => {
    const pr = makePr({ commitCount: 1 });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('1 commit')).toBeDefined();
  });

  it('renders labels when present', () => {
    const pr = makePr({ labels: ['bug', 'urgent'] });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByText('bug')).toBeDefined();
    expect(screen.getByText('urgent')).toBeDefined();
  });

  it('does not render labels section when empty', () => {
    const pr = makePr({ labels: [] });
    const { container } = render(<QuickReviewCard pr={pr} />);
    const labels = container.querySelectorAll('.rounded-full');
    expect(labels.length).toBe(0);
  });

  it('renders body as markdown when present', () => {
    const pr = makePr({ body: '## Changes\n- Fixed a bug' });
    render(<QuickReviewCard pr={pr} />);
    expect(screen.getByTestId('markdown').textContent).toContain('## Changes');
  });

  it('does not render body section when body is empty', () => {
    const pr = makePr({ body: '' });
    const { container } = render(<QuickReviewCard pr={pr} />);
    expect(container.querySelector('.markdown-body')).toBeNull();
  });
});
