import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestFileChange } from '@/types';

// Mock IntersectionObserver for jsdom
beforeEach(() => {
  globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

const mockGetClient = vi.fn();
const mockGetPRFiles = vi.fn();
const mockGetPRCommits = vi.fn();

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/github', () => ({
  getPRFiles: (...args: unknown[]) => mockGetPRFiles(...args),
  getPRCommits: (...args: unknown[]) => mockGetPRCommits(...args),
  getCommitFiles: vi.fn(),
}));

const mockSubmitReview = vi.fn();
vi.mock('@/services/github/mutations', () => ({
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/cache', () => ({
  loadTabData: vi.fn().mockResolvedValue(null),
  saveTabData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../diff/DiffFileSection', () => ({
  DiffFileSection: vi.fn(({ file }: { file: { filename: string } }) => (
    <div data-testid={`diff-section-${file.filename}`}>{file.filename}</div>
  )),
}));

vi.mock('../diff/DiffFileTree', () => ({
  DiffFileTree: () => <div data-testid="diff-file-tree">File Tree</div>,
}));

vi.mock('../diff/DiffToolbar', () => ({
  DiffToolbar: () => <div data-testid="diff-toolbar">Toolbar</div>,
}));

import { FilesTab } from '../FilesTab';

function makeFile(overrides: Partial<PullRequestFileChange> = {}): PullRequestFileChange {
  return {
    filename: 'src/app.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    patch: '@@ -1,3 +1,3 @@\n-old\n+new\n ctx',
    sha: 'abc123',
    ...overrides,
  };
}

describe('FilesTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue({});
    mockGetPRCommits.mockResolvedValue([]);
  });

  it('shows loading skeleton initially', () => {
    mockGetPRFiles.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows empty state when no files', async () => {
    mockGetPRFiles.mockResolvedValue([]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
  });

  it('wraps the empty state in a Card primitive', async () => {
    mockGetPRFiles.mockResolvedValue([]);
    const { container } = render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
    expect(container.querySelector('.bd-card')).toBeTruthy();
  });

  it('renders diff sections for each file', async () => {
    mockGetPRFiles.mockResolvedValue([
      makeFile({ filename: 'src/app.ts' }),
      makeFile({ filename: 'src/utils.ts' }),
    ]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-section-src/app.ts')).toBeTruthy();
      expect(screen.getByTestId('diff-section-src/utils.ts')).toBeTruthy();
    });
  });

  it('renders toolbar', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-toolbar')).toBeTruthy();
    });
  });

  it('renders file tree', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-file-tree')).toBeTruthy();
    });
  });

  it('shows empty state on fetch error (cache hook absorbs errors)', async () => {
    mockGetPRFiles.mockRejectedValue(new Error('Network error'));
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // useCachedTabData catches the error; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
  });

  it('shows empty state on non-Error rejection (cache hook absorbs errors)', async () => {
    mockGetPRFiles.mockRejectedValue('string error');
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
  });

  it('passes correct params to getPRFiles', async () => {
    mockGetPRFiles.mockResolvedValue([]);
    render(
      <FilesTab
        prNumber={42}
        repoOwner="myorg"
        repoName="myrepo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(mockGetPRFiles).toHaveBeenCalledWith(expect.anything(), 'myorg', 'myrepo', 42);
    });
  });

  it('handles null client gracefully', async () => {
    mockGetClient.mockReturnValue(null);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // fetchFn throws, useCachedTabData catches it; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
  });

  it('shows large PR warning for 300+ files', async () => {
    const files = Array.from({ length: 301 }, (_, i) => makeFile({ filename: `file${i}.ts` }));
    mockGetPRFiles.mockResolvedValue(files);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/This PR has 301 changed files/)).toBeTruthy();
    });
  });

  it('wraps the large-PR warning in a Card with a warning Pill', async () => {
    const files = Array.from({ length: 301 }, (_, i) => makeFile({ filename: `file${i}.ts` }));
    mockGetPRFiles.mockResolvedValue(files);
    const { container } = render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/This PR has 301 changed files/)).toBeTruthy();
    });
    expect(container.querySelector('.bd-card')).toBeTruthy();
    expect(container.querySelector('.bd-pill--warning')).toBeTruthy();
  });

  it('does not show large PR warning for fewer than 300 files', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-section-src/app.ts')).toBeTruthy();
    });
    expect(screen.queryByText(/Large PRs may be slow/)).toBeNull();
  });

  it('renders multiple file types', async () => {
    mockGetPRFiles.mockResolvedValue([
      makeFile({ filename: 'src/added.ts', status: 'added', additions: 20, deletions: 0 }),
      makeFile({ filename: 'src/removed.ts', status: 'removed', additions: 0, deletions: 15 }),
      makeFile({
        filename: 'src/renamed.ts',
        status: 'renamed',
        additions: 1,
        deletions: 1,
        previousFilename: 'src/old.ts',
      }),
      makeFile({ filename: 'src/copied.ts', status: 'copied', additions: 0, deletions: 0 }),
    ]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-section-src/added.ts')).toBeTruthy();
      expect(screen.getByTestId('diff-section-src/removed.ts')).toBeTruthy();
      expect(screen.getByTestId('diff-section-src/renamed.ts')).toBeTruthy();
      expect(screen.getByTestId('diff-section-src/copied.ts')).toBeTruthy();
    });
  });

  it('fetches commits for the scope selector', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    mockGetPRCommits.mockResolvedValue([
      { sha: 'abc', message: 'First commit', author: 'dev', date: '2026-01-01' },
    ]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(mockGetPRCommits).toHaveBeenCalledWith(expect.anything(), 'owner', 'repo', 1);
    });
  });

  it('persists view mode to localStorage', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('diff-toolbar')).toBeTruthy();
    });
    // Default view mode should be saved
    expect(localStorage.getItem('borgdock:diff-view-mode')).toBe('unified');
  });

  // ---- Submit Review composer ----

  it('renders Submit Review composer at the bottom of the diff scroll', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(
      <FilesTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Submit Review')).toBeTruthy();
      expect(screen.getByDisplayValue('Comment')).toBeTruthy();
      expect(screen.getByText('Submit')).toBeTruthy();
    });
  });

  it('submits review with selected event and body', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    mockSubmitReview.mockResolvedValue(undefined);
    const { fireEvent } = await import('@testing-library/react');
    render(
      <FilesTab
        prNumber={42}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => screen.getByText('Submit Review'));

    fireEvent.change(screen.getByPlaceholderText('Review comment (optional for APPROVE)'), {
      target: { value: 'looks good' },
    });
    fireEvent.change(screen.getByDisplayValue('Comment'), { target: { value: 'APPROVE' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledWith(
        expect.anything(),
        'owner',
        'repo',
        42,
        'APPROVE',
        'looks good',
      );
    });
  });
});

// ---- toDiffFile helper tests ----

import { toDiffFile } from '../FilesTab';

describe('toDiffFile', () => {
  it('maps added file correctly', () => {
    const result = toDiffFile(
      makeFile({ status: 'added', additions: 10, deletions: 0, patch: '+new' }),
    );
    expect(result.status).toBe('added');
    expect(result.isBinary).toBe(false);
  });

  it('maps removed file correctly', () => {
    const result = toDiffFile(
      makeFile({ status: 'removed', additions: 0, deletions: 5, patch: '-old' }),
    );
    expect(result.status).toBe('removed');
  });

  it('maps renamed file correctly', () => {
    const result = toDiffFile(makeFile({ status: 'renamed', previousFilename: 'old.ts' }));
    expect(result.status).toBe('renamed');
    expect(result.previousFilename).toBe('old.ts');
  });

  it('maps copied file correctly', () => {
    const result = toDiffFile(makeFile({ status: 'copied' }));
    expect(result.status).toBe('copied');
  });

  it('maps unknown status to "modified"', () => {
    const result = toDiffFile(makeFile({ status: 'changed' as PullRequestFileChange['status'] }));
    expect(result.status).toBe('modified');
  });

  it('detects binary files (no patch, not renamed/removed, zero additions/deletions)', () => {
    const result = toDiffFile({
      filename: 'image.png',
      status: 'added',
      additions: 0,
      deletions: 0,
      sha: 'abc',
    });
    expect(result.isBinary).toBe(true);
  });

  it('does not mark as binary when additions > 0', () => {
    const result = toDiffFile({
      filename: 'file.ts',
      status: 'modified',
      additions: 5,
      deletions: 0,
      sha: 'abc',
    });
    expect(result.isBinary).toBe(false);
  });
});
