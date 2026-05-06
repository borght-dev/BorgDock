import { describe, expect, it, vi } from 'vitest';
import {
  buildSnippetFromPatch,
  getReviewThreads,
  REVIEW_THREADS_QUERY,
  resolveReviewThread,
  unresolveReviewThread,
} from '../reviewThreads';

describe('buildSnippetFromPatch', () => {
  it('extracts ±2 lines centered on the anchor', () => {
    const patch = [
      '@@ -10,4 +10,5 @@',
      ' line 10 context',
      '-line 11 deleted',
      '+line 11 added',
      '+line 12 added',
      ' line 13 context',
    ].join('\n');
    const snippet = buildSnippetFromPatch(patch, 12);
    const anchor = snippet.find((s) => s.isAnchor);
    expect(anchor).toBeDefined();
    expect(anchor!.lineNumber).toBe(12);
    expect(anchor!.marker).toBe('+');
    expect(snippet.length).toBeGreaterThanOrEqual(2);
    expect(snippet.length).toBeLessThanOrEqual(6);
  });

  it('returns just the anchor line when the patch is unavailable', () => {
    const snippet = buildSnippetFromPatch(undefined, 42);
    expect(snippet).toEqual([
      { lineNumber: 42, marker: ' ', text: '', isAnchor: true },
    ]);
  });
});

describe('REVIEW_THREADS_QUERY', () => {
  it('queries pullRequest.reviewThreads.nodes with the fields we need', () => {
    expect(REVIEW_THREADS_QUERY).toContain('reviewThreads');
    expect(REVIEW_THREADS_QUERY).toContain('isResolved');
    expect(REVIEW_THREADS_QUERY).toContain('comments');
    expect(REVIEW_THREADS_QUERY).toContain('databaseId');
  });
});

describe('getReviewThreads', () => {
  it('maps GraphQL response into ReviewThread[]', async () => {
    const fakeClient = {
      graphql: vi.fn(async () => ({
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: 'PRT_a',
                  isResolved: true,
                  resolvedBy: { login: 'kvb' },
                  path: 'src/foo.ts',
                  line: 12,
                  comments: {
                    nodes: [
                      {
                        id: 'PRC_a1',
                        databaseId: 111,
                        author: { login: 'someone', __typename: 'User' },
                        body: '**suggestion**: rename',
                        createdAt: '2026-05-01T00:00:00Z',
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      })),
    };
    const filePatches = new Map<string, string | undefined>([
      [
        'src/foo.ts',
        '@@ -10,3 +10,3 @@\n line 10\n-line 11\n+line 12',
      ],
    ]);
    const threads = await getReviewThreads(
      fakeClient as never,
      'o',
      'r',
      1,
      filePatches,
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]!.id).toBe('PRT_a');
    expect(threads[0]!.isResolved).toBe(true);
    expect(threads[0]!.resolvedBy).toBe('kvb');
    expect(threads[0]!.comments[0]!.severity).toBe('suggestion');
    expect(threads[0]!.comments[0]!.authorIsBot).toBe(false);
    expect(threads[0]!.snippet.length).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveReviewThread / unresolveReviewThread', () => {
  it('issues the resolve mutation', async () => {
    const fakeClient = { graphql: vi.fn(async () => ({})) };
    await resolveReviewThread(fakeClient as never, 'PRT_a');
    expect(fakeClient.graphql).toHaveBeenCalled();
    const firstCall = fakeClient.graphql.mock.calls[0] as unknown as [string, unknown];
    expect(firstCall[0]).toContain('resolveReviewThread');
    expect(firstCall[1]).toEqual({ threadId: 'PRT_a' });
  });

  it('issues the unresolve mutation', async () => {
    const fakeClient = { graphql: vi.fn(async () => ({})) };
    await unresolveReviewThread(fakeClient as never, 'PRT_a');
    const firstCall = fakeClient.graphql.mock.calls[0] as unknown as [string, unknown];
    expect(firstCall[0]).toContain('unresolveReviewThread');
  });
});
