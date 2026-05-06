import type {
  ReviewThread,
  ReviewThreadComment,
  ReviewThreadSnippetLine,
} from '@/types';
import { detectSeverity } from './reviews';
import type { GitHubClient } from './client';

export const REVIEW_THREADS_QUERY = /* GraphQL */ `
  query ReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            resolvedBy { login }
            path
            line
            comments(first: 50) {
              nodes {
                id
                databaseId
                author { login __typename }
                body
                createdAt
              }
            }
          }
        }
      }
    }
  }
`;

const RESOLVE_MUTATION = /* GraphQL */ `
  mutation ResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

const UNRESOLVE_MUTATION = /* GraphQL */ `
  mutation UnresolveThread($threadId: ID!) {
    unresolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

interface QueryResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          isResolved: boolean;
          resolvedBy: { login: string } | null;
          path: string;
          line: number | null;
          comments: {
            nodes: Array<{
              id: string;
              databaseId: number;
              author: { login: string; __typename: string } | null;
              body: string;
              createdAt: string;
            }>;
          };
        }>;
      };
    };
  };
}

const SNIPPET_RADIUS = 2;

/**
 * Walk a unified diff patch and return up to ~5 lines of context around the anchor.
 * Returns just `[{ anchor }]` if patch is unavailable.
 */
export function buildSnippetFromPatch(
  patch: string | undefined,
  anchorLine: number,
): ReviewThreadSnippetLine[] {
  if (!patch) {
    return [{ lineNumber: anchorLine, marker: ' ', text: '', isAnchor: true }];
  }

  const lines: ReviewThreadSnippetLine[] = [];
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      if (m && m[1]) newLine = parseInt(m[1], 10) - 1;
      continue;
    }
    const marker: '+' | '-' | ' ' =
      raw.startsWith('+') ? '+' : raw.startsWith('-') ? '-' : ' ';
    const text = raw.slice(1);
    let lineNumber: number | null = null;
    if (marker === '+' || marker === ' ') {
      newLine += 1;
      lineNumber = newLine;
    }
    lines.push({
      lineNumber,
      marker,
      text,
      isAnchor: lineNumber === anchorLine,
    });
  }

  const anchorIdx = lines.findIndex((l) => l.isAnchor);
  if (anchorIdx === -1) {
    return [{ lineNumber: anchorLine, marker: ' ', text: '', isAnchor: true }];
  }
  const start = Math.max(0, anchorIdx - SNIPPET_RADIUS);
  const end = Math.min(lines.length, anchorIdx + SNIPPET_RADIUS + 1);
  return lines.slice(start, end);
}

function isBotLogin(author: { login: string; __typename: string } | null): boolean {
  if (!author) return false;
  if (author.__typename === 'Bot') return true;
  return author.login.endsWith('[bot]') || author.login.endsWith('-bot');
}

function mapSeverity(body: string): ReviewThreadComment['severity'] {
  const detected = detectSeverity(body);
  if (detected === 'critical' || detected === 'suggestion' || detected === 'praise') {
    return detected;
  }
  return undefined;
}

export async function getReviewThreads(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
  /** Map of file path → unified-diff patch, used to hydrate per-thread snippets. */
  filePatches: Map<string, string | undefined>,
): Promise<ReviewThread[]> {
  const all: ReviewThread[] = [];
  let cursor: string | null = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const data: QueryResponse = await client.graphql(REVIEW_THREADS_QUERY, {
      owner,
      repo,
      number,
      cursor,
    });
    const page = data.repository.pullRequest.reviewThreads;
    for (const node of page.nodes) {
      const line = node.line ?? 0;
      const patch = filePatches.get(node.path);
      all.push({
        id: node.id,
        filePath: node.path,
        line,
        isResolved: node.isResolved,
        resolvedBy: node.resolvedBy?.login ?? undefined,
        snippet: buildSnippetFromPatch(patch, line),
        comments: node.comments.nodes.map((c): ReviewThreadComment => ({
          id: c.id,
          databaseId: c.databaseId,
          author: c.author?.login ?? '',
          authorIsBot: isBotLogin(c.author),
          body: c.body,
          createdAt: c.createdAt,
          severity: mapSeverity(c.body),
        })),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (!cursor) break;
  }

  return all;
}

export async function resolveReviewThread(
  client: GitHubClient,
  threadId: string,
): Promise<void> {
  await client.graphql(RESOLVE_MUTATION, { threadId });
}

export async function unresolveReviewThread(
  client: GitHubClient,
  threadId: string,
): Promise<void> {
  await client.graphql(UNRESOLVE_MUTATION, { threadId });
}
