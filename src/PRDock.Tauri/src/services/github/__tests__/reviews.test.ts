import { describe, expect, it, vi } from 'vitest';
import type { ClaudeReviewComment } from '@/types';
import type { GitHubClient } from '../client';
import {
  detectSeverity,
  getAllComments,
  getBotReviewComments,
  getReviewComments,
  getReviews,
  splitStructuredReview,
} from '../reviews';

function createMockClient() {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    post: vi.fn(),
    getRateLimit: vi.fn(),
    isRateLimitLow: false,
  } as unknown as GitHubClient;
}

describe('getReviews', () => {
  it('fetches reviews for a PR', async () => {
    const client = createMockClient();
    const reviews = [
      {
        id: 1,
        state: 'APPROVED',
        body: 'Looks good',
        submitted_at: '2025-01-15T10:00:00Z',
        user: { login: 'alice' },
      },
    ];
    vi.mocked(client.get).mockResolvedValueOnce(reviews);

    const result = await getReviews(client, 'owner', 'repo', 42);

    expect(result).toEqual(reviews);
    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews');
  });
});

describe('getReviewComments', () => {
  it('fetches and maps PR review comments', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        id: 100,
        body: 'Consider using a const here',
        path: 'src/app.ts',
        line: 42,
        original_line: 40,
        html_url: 'https://github.com/owner/repo/pull/1#comment-100',
        created_at: '2025-01-15T10:00:00Z',
        user: { login: 'bob' },
      },
    ]);

    const result = await getReviewComments(client, 'owner', 'repo', 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: '100',
      author: 'bob',
      body: 'Consider using a const here',
      filePath: 'src/app.ts',
      lineNumber: 42,
      severity: 'suggestion',
      createdAt: '2025-01-15T10:00:00Z',
      htmlUrl: 'https://github.com/owner/repo/pull/1#comment-100',
    });
    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/pulls/1/comments');
  });

  it('falls back to original_line when line is null', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        id: 101,
        body: 'Nice work',
        path: null,
        line: null,
        original_line: 25,
        html_url: null,
        created_at: '2025-01-15T10:00:00Z',
        user: null,
      },
    ]);

    const result = await getReviewComments(client, 'owner', 'repo', 1);

    expect(result[0]).toEqual({
      id: '101',
      author: '',
      body: 'Nice work',
      filePath: undefined,
      lineNumber: 25,
      severity: 'praise',
      createdAt: '2025-01-15T10:00:00Z',
      htmlUrl: '',
    });
  });

  it('handles null body and null user', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        id: 102,
        body: null,
        path: null,
        line: null,
        original_line: null,
        html_url: null,
        created_at: '2025-01-15T10:00:00Z',
        user: null,
      },
    ]);

    const result = await getReviewComments(client, 'owner', 'repo', 1);

    expect(result[0]!.author).toBe('');
    expect(result[0]!.body).toBe('');
    expect(result[0]!.filePath).toBeUndefined();
    expect(result[0]!.lineNumber).toBeUndefined();
  });
});

describe('getBotReviewComments', () => {
  it('filters PR review comments by bot username', async () => {
    const client = createMockClient();

    // PR review comments
    vi.mocked(client.get)
      .mockResolvedValueOnce([
        {
          id: 200,
          body: '[critical] Bug found',
          path: 'src/main.ts',
          line: 10,
          original_line: null,
          html_url: 'https://example.com/200',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'claude-bot' },
        },
        {
          id: 201,
          body: 'Regular comment',
          path: 'src/main.ts',
          line: 20,
          original_line: null,
          html_url: 'https://example.com/201',
          created_at: '2025-01-15T10:01:00Z',
          user: { login: 'alice' },
        },
      ])
      // Issue comments
      .mockResolvedValueOnce([]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('200');
    expect(result[0]!.severity).toBe('critical');
  });

  it('filters issue comments by bot username', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockResolvedValueOnce([]) // PR review comments
      .mockResolvedValueOnce([
        {
          id: 300,
          body: 'Good job on the tests',
          html_url: 'https://example.com/300',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'claude-bot' },
        },
        {
          id: 301,
          body: 'Normal comment',
          html_url: 'https://example.com/301',
          created_at: '2025-01-15T10:01:00Z',
          user: { login: 'bob' },
        },
      ]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('300');
    expect(result[0]!.severity).toBe('praise');
  });

  it('case-insensitive bot username matching', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockResolvedValueOnce([
        {
          id: 400,
          body: 'test',
          path: null,
          line: null,
          original_line: null,
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'Claude-Bot' },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(1);
  });

  it('splits structured issue comments from bot', async () => {
    const client = createMockClient();
    const structuredBody = `## Issues
- [critical] Security vulnerability in auth module
- Consider using typed errors

## Positives
- Great test coverage
- Clean code structure`;

    vi.mocked(client.get)
      .mockResolvedValueOnce([]) // PR review comments
      .mockResolvedValueOnce([
        {
          id: 500,
          body: structuredBody,
          html_url: 'https://example.com/500',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'claude-bot' },
        },
      ]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(4);
  });

  it('handles review comments API failure silently', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockRejectedValueOnce(new Error('Network error')) // PR review comments fail
      .mockResolvedValueOnce([
        {
          id: 600,
          body: 'Bot comment',
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'claude-bot' },
        },
      ]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('600');
  });

  it('handles issue comments API failure silently', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockResolvedValueOnce([
        {
          id: 700,
          body: 'Inline bot comment',
          path: 'file.ts',
          line: 5,
          original_line: null,
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'claude-bot' },
        },
      ])
      .mockRejectedValueOnce(new Error('Network error')); // Issue comments fail

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('700');
  });

  it('handles null user in comments', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockResolvedValueOnce([
        {
          id: 800,
          body: 'Comment with no user',
          path: null,
          line: null,
          original_line: null,
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getBotReviewComments(client, 'owner', 'repo', 1, 'claude');

    // Null user has empty login which won't match 'claude'
    expect(result).toHaveLength(0);
  });
});

describe('getAllComments', () => {
  it('combines and sorts PR review and issue comments', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockResolvedValueOnce([
        {
          id: 1,
          body: 'First comment',
          path: 'file.ts',
          line: 10,
          original_line: null,
          html_url: '',
          created_at: '2025-01-15T12:00:00Z',
          user: { login: 'alice' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          body: 'Earlier comment',
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'bob' },
        },
      ]);

    const result = await getAllComments(client, 'owner', 'repo', 1);

    expect(result).toHaveLength(2);
    // Sorted by createdAt ascending
    expect(result[0]!.author).toBe('bob');
    expect(result[1]!.author).toBe('alice');
  });

  it('returns empty array when both endpoints fail', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'));

    const result = await getAllComments(client, 'owner', 'repo', 1);

    expect(result).toEqual([]);
  });

  it('returns partial results when one endpoint fails', async () => {
    const client = createMockClient();

    vi.mocked(client.get)
      .mockRejectedValueOnce(new Error('fail')) // PR review comments
      .mockResolvedValueOnce([
        {
          id: 10,
          body: 'Issue comment',
          html_url: '',
          created_at: '2025-01-15T10:00:00Z',
          user: { login: 'alice' },
        },
      ]);

    const result = await getAllComments(client, 'owner', 'repo', 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.author).toBe('alice');
  });
});

describe('detectSeverity', () => {
  it('detects [critical] tag', () => {
    expect(detectSeverity('[critical] This is a major bug')).toBe('critical');
  });

  it('detects **critical** tag', () => {
    expect(detectSeverity('**critical** Fix this immediately')).toBe('critical');
  });

  it('detects [suggestion] tag', () => {
    expect(detectSeverity('[suggestion] Consider using a map')).toBe('suggestion');
  });

  it('detects **suggestion** tag', () => {
    expect(detectSeverity('**suggestion** Maybe refactor this')).toBe('suggestion');
  });

  it('detects [praise] tag', () => {
    expect(detectSeverity('[praise] Great implementation')).toBe('praise');
  });

  it('detects **praise** tag', () => {
    expect(detectSeverity('**praise** Well done')).toBe('praise');
  });

  it('detects "bug" keyword as critical', () => {
    expect(detectSeverity('This introduces a bug in the parsing logic')).toBe('critical');
  });

  it('detects "vulnerability" keyword as critical', () => {
    expect(detectSeverity('This has a vulnerability')).toBe('critical');
  });

  it('detects "security issue" keyword as critical', () => {
    expect(detectSeverity('There is a security issue here')).toBe('critical');
  });

  it('detects "breaking change" keyword as critical', () => {
    expect(detectSeverity('This is a breaking change')).toBe('critical');
  });

  it('detects "nice" keyword as praise', () => {
    expect(detectSeverity('nice approach here')).toBe('praise');
  });

  it('detects "good job" keyword as praise', () => {
    expect(detectSeverity('good job on the refactor')).toBe('praise');
  });

  it('detects "great" keyword as praise', () => {
    expect(detectSeverity('great implementation')).toBe('praise');
  });

  it('detects "well done" keyword as praise', () => {
    expect(detectSeverity('well done on the tests')).toBe('praise');
  });

  it('detects "excellent" keyword as praise', () => {
    expect(detectSeverity('excellent work')).toBe('praise');
  });

  it('detects "consider" keyword as suggestion', () => {
    expect(detectSeverity('consider using a different approach')).toBe('suggestion');
  });

  it('detects "might want" keyword as suggestion', () => {
    expect(detectSeverity('you might want to refactor this')).toBe('suggestion');
  });

  it('detects "could also" keyword as suggestion', () => {
    expect(detectSeverity('you could also use a map here')).toBe('suggestion');
  });

  it('detects "nit" keyword as suggestion', () => {
    expect(detectSeverity('nit: spacing is inconsistent')).toBe('suggestion');
  });

  it('returns unknown for unrecognized body', () => {
    expect(detectSeverity('Just a plain comment')).toBe('unknown');
  });

  it('returns unknown for empty body', () => {
    expect(detectSeverity('')).toBe('unknown');
  });

  it('is case-insensitive for tags', () => {
    expect(detectSeverity('[CRITICAL] Urgent fix needed')).toBe('critical');
    expect(detectSeverity('**SUGGESTION** Maybe try this')).toBe('suggestion');
    expect(detectSeverity('[Praise] Nice code')).toBe('praise');
  });

  it('prioritizes explicit tags over keyword heuristics', () => {
    // [critical] tag wins even if body also contains "nice"
    expect(detectSeverity('[critical] nice bug found')).toBe('critical');
  });
});

describe('splitStructuredReview', () => {
  function makeComment(body: string): ClaudeReviewComment {
    return {
      id: 'c1',
      author: 'bot',
      body,
      severity: 'unknown',
      createdAt: '2025-01-15T10:00:00Z',
      htmlUrl: 'https://example.com',
    };
  }

  it('returns original comment when no structured sections found', () => {
    const comment = makeComment('Just a plain review comment.');
    const result = splitStructuredReview(comment);
    expect(result).toEqual([comment]);
  });

  it('splits issues section into individual items', () => {
    const comment = makeComment(`## Issues
- [critical] Security vulnerability in auth module
- Consider using typed errors`);

    const result = splitStructuredReview(comment);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('c1-issue-0');
    expect(result[0]!.body).toBe('[critical] Security vulnerability in auth module');
    expect(result[0]!.severity).toBe('critical');
    expect(result[1]!.id).toBe('c1-issue-1');
    expect(result[1]!.body).toBe('Consider using typed errors');
    expect(result[1]!.severity).toBe('suggestion');
  });

  it('splits positives section into individual items with praise severity', () => {
    const comment = makeComment(`## Positives
- Great test coverage
- Clean code structure`);

    const result = splitStructuredReview(comment);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('c1-positive-0');
    expect(result[0]!.body).toBe('Great test coverage');
    expect(result[0]!.severity).toBe('praise');
    expect(result[1]!.id).toBe('c1-positive-1');
    expect(result[1]!.body).toBe('Clean code structure');
    expect(result[1]!.severity).toBe('praise');
  });

  it('splits both issues and positives sections', () => {
    const comment = makeComment(`## Issues
- Fix the null check
## Positives
- Well structured code`);

    const result = splitStructuredReview(comment);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toContain('issue');
    expect(result[1]!.id).toContain('positive');
  });

  it('handles * bullet points', () => {
    const comment = makeComment(`## Issues
* First issue
* Second issue`);

    const result = splitStructuredReview(comment);

    expect(result).toHaveLength(2);
    expect(result[0]!.body).toBe('First issue');
    expect(result[1]!.body).toBe('Second issue');
  });

  it('skips empty lines in sections', () => {
    const comment = makeComment(`## Issues
- First issue

- Second issue`);

    const result = splitStructuredReview(comment);

    expect(result).toHaveLength(2);
  });

  it('returns original comment when sections have no bullet items', () => {
    const comment = makeComment(`## Issues
Some text without bullets`);

    const result = splitStructuredReview(comment);

    expect(result).toEqual([comment]);
  });

  it('preserves parent comment fields in split items', () => {
    const comment = makeComment(`## Issues
- Fix the bug`);
    comment.filePath = 'src/main.ts';
    comment.lineNumber = 42;

    const result = splitStructuredReview(comment);

    expect(result[0]!.author).toBe('bot');
    expect(result[0]!.createdAt).toBe('2025-01-15T10:00:00Z');
    expect(result[0]!.htmlUrl).toBe('https://example.com');
  });
});
