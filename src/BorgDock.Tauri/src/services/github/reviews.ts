import { createLogger } from '@/services/logger';
import type { ClaudeReviewComment, CommentSeverity } from '@/types';
import type { GitHubClient } from './client';

const log = createLogger('github:reviews');

// --- GitHub API DTOs ---

interface GitHubPrReviewCommentDto {
  id: number;
  body: string | null;
  body_html?: string;
  path: string | null;
  line: number | null;
  original_line: number | null;
  html_url: string | null;
  created_at: string;
  user: { login: string } | null;
}

interface GitHubIssueCommentDto {
  id: number;
  body: string | null;
  body_html?: string;
  html_url: string | null;
  created_at: string;
  user: { login: string } | null;
}

interface GitHubReviewDto {
  id: number;
  state: string;
  body: string | null;
  body_html?: string;
  submitted_at: string;
  user: { login: string } | null;
}

// --- Public API ---

interface CommentFetchOptions {
  paginate?: boolean;
  renderedBody?: boolean;
  onError?: (source: string, error: unknown) => void;
}

async function getCommentPages<T>(
  client: GitHubClient,
  path: string,
  options: CommentFetchOptions,
): Promise<T[]> {
  const fetchPage = (url: string) =>
    options.renderedBody
      ? client.get<T[]>(url, { renderedBody: path.includes('/pulls/') ? 'review' : 'issue' })
      : client.get<T[]>(url);
  if (!options.paginate) return fetchPage(path);
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const batch = await fetchPage(`${path}?per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export async function getReviews(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  options: CommentFetchOptions = {},
): Promise<GitHubReviewDto[]> {
  const reviews = await getCommentPages<GitHubReviewDto>(
    client,
    `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    options,
  );
  return options.renderedBody
    ? reviews.map((review) => ({ ...review, body: review.body_html ?? review.body }))
    : reviews;
}

export async function getReviewComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ClaudeReviewComment[]> {
  const dtos = await client.get<GitHubPrReviewCommentDto[]>(
    `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
  );

  return dtos.map((dto) => ({
    id: String(dto.id),
    author: dto.user?.login ?? '',
    body: dto.body ?? '',
    filePath: dto.path ?? undefined,
    lineNumber: dto.line ?? dto.original_line ?? undefined,
    severity: detectSeverity(dto.body ?? ''),
    createdAt: dto.created_at,
    htmlUrl: dto.html_url ?? '',
  }));
}

export async function getBotReviewComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  botUsername: string,
): Promise<ClaudeReviewComment[]> {
  const comments: ClaudeReviewComment[] = [];
  const botLower = botUsername.toLowerCase();

  // 1. PR review comments (inline code comments)
  try {
    const reviewDtos = await client.get<GitHubPrReviewCommentDto[]>(
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    );

    for (const dto of reviewDtos) {
      const login = dto.user?.login ?? '';
      if (!login.toLowerCase().includes(botLower)) continue;

      comments.push({
        id: String(dto.id),
        author: login,
        body: dto.body ?? '',
        filePath: dto.path ?? undefined,
        lineNumber: dto.line ?? dto.original_line ?? undefined,
        severity: detectSeverity(dto.body ?? ''),
        createdAt: dto.created_at,
        htmlUrl: dto.html_url ?? '',
      });
    }
  } catch (err) {
    log.warn('failed to fetch bot PR review comments', {
      owner,
      repo,
      prNumber,
      error: String(err),
    });
  }

  // 2. Issue comments (top-level PR comments)
  try {
    const issueDtos = await client.get<GitHubIssueCommentDto[]>(
      `repos/${owner}/${repo}/issues/${prNumber}/comments`,
    );

    for (const dto of issueDtos) {
      const login = dto.user?.login ?? '';
      if (!login.toLowerCase().includes(botLower)) continue;

      const comment: ClaudeReviewComment = {
        id: String(dto.id),
        author: login,
        body: dto.body ?? '',
        severity: detectSeverity(dto.body ?? ''),
        createdAt: dto.created_at,
        htmlUrl: dto.html_url ?? '',
      };

      // Split structured reviews into individual items
      const splitItems = splitStructuredReview(comment);
      if (splitItems.length > 1) {
        comments.push(...splitItems);
      } else {
        comments.push(comment);
      }
    }
  } catch (err) {
    log.warn('failed to fetch bot issue comments', { owner, repo, prNumber, error: String(err) });
  }

  return comments;
}

export async function getAllComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  options: CommentFetchOptions = {},
): Promise<ClaudeReviewComment[]> {
  const comments: ClaudeReviewComment[] = [];

  // PR review comments
  try {
    const reviewDtos = await getCommentPages<GitHubPrReviewCommentDto>(
      client,
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      options,
    );

    for (const dto of reviewDtos) {
      comments.push({
        id: String(dto.id),
        author: dto.user?.login ?? '',
        body: (options.renderedBody ? dto.body_html : undefined) ?? dto.body ?? '',
        filePath: dto.path ?? undefined,
        lineNumber: dto.line ?? dto.original_line ?? undefined,
        severity: detectSeverity(dto.body ?? ''),
        createdAt: dto.created_at,
        htmlUrl: dto.html_url ?? '',
      });
    }
  } catch (err) {
    log.warn('failed to fetch PR review comments', { owner, repo, prNumber, error: String(err) });
    options.onError?.('Inline comments', err);
  }

  // Issue comments
  try {
    const issueDtos = await getCommentPages<GitHubIssueCommentDto>(
      client,
      `repos/${owner}/${repo}/issues/${prNumber}/comments`,
      options,
    );

    for (const dto of issueDtos) {
      comments.push({
        id: String(dto.id),
        author: dto.user?.login ?? '',
        body: (options.renderedBody ? dto.body_html : undefined) ?? dto.body ?? '',
        severity: detectSeverity(dto.body ?? ''),
        createdAt: dto.created_at,
        htmlUrl: dto.html_url ?? '',
      });
    }
  } catch (err) {
    log.warn('failed to fetch issue comments', { owner, repo, prNumber, error: String(err) });
    options.onError?.('PR comments', err);
  }

  return comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// --- Severity detection ---

export function detectSeverity(body: string): CommentSeverity {
  const lower = body.toLowerCase();

  if (lower.includes('[critical]') || lower.includes('**critical**')) {
    return 'critical';
  }
  if (lower.includes('[suggestion]') || lower.includes('**suggestion**')) {
    return 'suggestion';
  }
  if (lower.includes('[praise]') || lower.includes('**praise**')) {
    return 'praise';
  }

  // Heuristic: if it contains "bug", "vulnerability", "security", "breaking" -> critical
  if (/\b(bug|vulnerability|security issue|breaking change)\b/i.test(body)) {
    return 'critical';
  }

  // If it contains "nice", "good", "great", "well done" -> praise
  if (/\b(nice|good job|great|well done|excellent)\b/i.test(body)) {
    return 'praise';
  }

  // If it contains "consider", "might want", "could", "suggestion" -> suggestion
  if (/\b(consider|might want|could also|nit)\b/i.test(body)) {
    return 'suggestion';
  }

  return 'unknown';
}

export function splitStructuredReview(comment: ClaudeReviewComment): ClaudeReviewComment[] {
  const body = comment.body;

  // Look for structured sections like "## Issues" or "## Positives"
  const issuesMatch = body.match(/##\s*Issues?\s*\n([\s\S]*?)(?=##|$)/i);
  const positivesMatch = body.match(/##\s*Positives?\s*\n([\s\S]*?)(?=##|$)/i);

  if (!issuesMatch && !positivesMatch) {
    return [comment];
  }

  const items: ClaudeReviewComment[] = [];
  let itemIndex = 0;

  if (issuesMatch) {
    const issueLines = issuesMatch[1]!
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    for (const line of issueLines) {
      const text = line.replace(/^[\s\-*]+/, '').trim();
      if (!text) continue;
      items.push({
        ...comment,
        id: `${comment.id}-issue-${itemIndex++}`,
        body: text,
        severity: detectSeverity(text),
      });
    }
  }

  if (positivesMatch) {
    const positiveLines = positivesMatch[1]!
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    for (const line of positiveLines) {
      const text = line.replace(/^[\s\-*]+/, '').trim();
      if (!text) continue;
      items.push({
        ...comment,
        id: `${comment.id}-positive-${itemIndex++}`,
        body: text,
        severity: 'praise',
      });
    }
  }

  return items.length > 0 ? items : [comment];
}
