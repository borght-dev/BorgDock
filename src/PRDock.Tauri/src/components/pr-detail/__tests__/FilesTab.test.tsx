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

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
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
      <FilesTab prNumber={1} repoOwner="owner" repoName="repo" />,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows empty state when no files', async () => {
    mockGetPRFiles.mockResolvedValue([]);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByText('No files changed in this pull request.')).toBeTruthy();
    });
  });

  it('renders diff sections for each file', async () => {
    mockGetPRFiles.mockResolvedValue([
      makeFile({ filename: 'src/app.ts' }),
      makeFile({ filename: 'src/utils.ts' }),
    ]);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByTestId('diff-section-src/app.ts')).toBeTruthy();
      expect(screen.getByTestId('diff-section-src/utils.ts')).toBeTruthy();
    });
  });

  it('renders toolbar', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByTestId('diff-toolbar')).toBeTruthy();
    });
  });

  it('renders file tree', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByTestId('diff-file-tree')).toBeTruthy();
    });
  });

  it('shows error state with retry button', async () => {
    mockGetPRFiles.mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
      expect(screen.getByText('Retry')).toBeTruthy();
    });
    consoleSpy.mockRestore();
  });

  it('shows generic error when error is not an Error instance', async () => {
    mockGetPRFiles.mockRejectedValue('string error');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load files')).toBeTruthy();
    });
    consoleSpy.mockRestore();
  });

  it('passes correct params to getPRFiles', async () => {
    mockGetPRFiles.mockResolvedValue([]);
    render(<FilesTab prNumber={42} repoOwner="myorg" repoName="myrepo" />);
    await waitFor(() => {
      expect(mockGetPRFiles).toHaveBeenCalledWith(
        expect.anything(),
        'myorg',
        'myrepo',
        42,
      );
    });
  });

  it('handles null client gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetClient.mockReturnValue(null);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByText('GitHub client not initialized')).toBeTruthy();
    });
    consoleSpy.mockRestore();
  });

  it('shows large PR warning for 300+ files', async () => {
    const files = Array.from({ length: 301 }, (_, i) =>
      makeFile({ filename: `file${i}.ts` }),
    );
    mockGetPRFiles.mockResolvedValue(files);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByText(/This PR has 301 changed files/)).toBeTruthy();
    });
  });

  it('does not show large PR warning for fewer than 300 files', async () => {
    mockGetPRFiles.mockResolvedValue([makeFile()]);
    render(<FilesTab prNumber={1} repoOwner="owner" repoName="repo" />);
    await waitFor(() => {
      expect(screen.getByTestId('diff-section-src/app.ts')).toBeTruthy();
    });
    expect(screen.queryByText(/Large PRs may be slow/)).toBeNull();
  });
});
