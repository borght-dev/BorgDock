import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscussionTab } from '../DiscussionTab';

vi.mock('@/hooks/useCachedTabData', () => ({
  useCachedTabData: <T,>(_o: string, _r: string, _n: number, dataType: string) => {
    if (dataType === 'reviews') {
      return {
        data: [
          {
            id: 1,
            state: 'APPROVED',
            body: null,
            submitted_at: '2026-05-01T01:00:00Z',
            user: { login: 'kvb' },
          },
        ],
        isLoading: false,
        isRefreshing: false,
      };
    }
    if (dataType === 'comments') {
      return {
        data: [
          {
            id: '1',
            author: 'sg',
            body: 'opening for review',
            severity: 'unknown',
            createdAt: '2026-05-01T00:00:00Z',
            htmlUrl: '',
          },
        ],
        isLoading: false,
        isRefreshing: false,
      };
    }
    if (dataType === 'reviewThreads') {
      return {
        data: [
          {
            id: 't1',
            filePath: 'src/foo.ts',
            line: 12,
            isResolved: false,
            snippet: [{ lineNumber: 12, marker: '+', text: 'x', isAnchor: true }],
            comments: [
              {
                id: 'c1',
                databaseId: 1,
                author: 'reviewer',
                authorIsBot: false,
                body: 'rename this',
                createdAt: '2026-05-01T02:00:00Z',
              },
            ],
          },
          {
            id: 't2',
            filePath: 'src/bar.ts',
            line: 5,
            isResolved: true,
            snippet: [{ lineNumber: 5, marker: '+', text: 'y', isAnchor: true }],
            comments: [
              {
                id: 'c2',
                databaseId: 2,
                author: 'reviewer',
                authorIsBot: false,
                body: 'old comment',
                createdAt: '2026-05-01T03:00:00Z',
              },
            ],
          },
        ],
        isLoading: false,
        isRefreshing: false,
      };
    }
    return { data: null as T | null, isLoading: false, isRefreshing: false };
  },
}));

vi.mock('@/services/github/singleton', () => ({
  getClientForRepo: () => ({}),
}));

vi.mock('@/services/github/pulls', () => ({
  getPRFiles: async () => [],
}));

const baseProps = {
  prNumber: 1,
  repoOwner: 'o',
  repoName: 'r',
  prUpdatedAt: '2026-05-01T00:00:00Z',
  onJumpToFile: vi.fn(),
};

describe('DiscussionTab', () => {
  it('renders all three item kinds when filter=all', () => {
    render(<DiscussionTab {...baseProps} />);
    expect(screen.getByText(/opening for review/i)).toBeInTheDocument();
    expect(screen.getByText(/^approved$/i)).toBeInTheDocument();
    expect(screen.getByText(/rename this/i)).toBeInTheDocument();
  });

  it('hides resolved code threads by default', () => {
    render(<DiscussionTab {...baseProps} />);
    expect(screen.queryByText(/old comment/i)).toBeNull();
  });

  it('Show resolved toggle reveals resolved code threads', () => {
    render(<DiscussionTab {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /show resolved/i }));
    expect(screen.getByText(/old comment/i)).toBeInTheDocument();
  });

  it('"On code" filter narrows to code threads', () => {
    render(<DiscussionTab {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^on code/i }));
    expect(screen.queryByText(/opening for review/i)).toBeNull();
    expect(screen.getByText(/rename this/i)).toBeInTheDocument();
  });
});
