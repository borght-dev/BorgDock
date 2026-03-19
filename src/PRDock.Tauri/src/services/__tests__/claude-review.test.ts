import { describe, expect, it } from 'vitest';
import type { ClaudeReviewComment } from '@/types';
import {
  detectSeverityFromBody,
  getReviewSummary,
  parseClaudeReviewComments,
} from '../claude-review';

function makeComment(overrides: Partial<ClaudeReviewComment> = {}): ClaudeReviewComment {
  return {
    id: '1',
    author: 'claude-bot',
    body: 'Test comment',
    severity: 'unknown',
    createdAt: '2025-01-15T10:00:00Z',
    htmlUrl: 'https://github.com/owner/repo/pull/1#comment-1',
    ...overrides,
  };
}

describe('detectSeverityFromBody', () => {
  it('detects [critical] marker', () => {
    expect(detectSeverityFromBody('[critical] This is a bug')).toBe('critical');
  });

  it('detects **critical** marker', () => {
    expect(detectSeverityFromBody('**critical** memory leak')).toBe('critical');
  });

  it('detects [warning] as critical', () => {
    expect(detectSeverityFromBody('[warning] possible issue')).toBe('critical');
  });

  it('detects [info] as suggestion', () => {
    expect(detectSeverityFromBody('[info] FYI something')).toBe('suggestion');
  });

  it('detects [suggestion] marker', () => {
    expect(detectSeverityFromBody('[suggestion] Consider refactoring')).toBe('suggestion');
  });

  it('detects [praise] marker', () => {
    expect(detectSeverityFromBody('[praise] Clean implementation')).toBe('praise');
  });

  it('detects bug/vulnerability keywords as critical', () => {
    expect(detectSeverityFromBody('This has a security issue')).toBe('critical');
    expect(detectSeverityFromBody('There is a bug here')).toBe('critical');
  });

  it('detects praise keywords', () => {
    expect(detectSeverityFromBody('Nice work on this function')).toBe('praise');
    expect(detectSeverityFromBody('Well done with the refactor')).toBe('praise');
  });

  it('detects suggestion keywords', () => {
    expect(detectSeverityFromBody('Consider using a map here')).toBe('suggestion');
    expect(detectSeverityFromBody('nit: extra whitespace')).toBe('suggestion');
  });

  it('returns unknown for ambiguous text', () => {
    expect(detectSeverityFromBody('Changed the return type')).toBe('unknown');
  });
});

describe('parseClaudeReviewComments', () => {
  it('groups comments by severity', () => {
    const comments = [
      makeComment({ id: '1', body: '[critical] SQL injection', severity: 'critical' }),
      makeComment({ id: '2', body: '[suggestion] Use const', severity: 'suggestion' }),
      makeComment({ id: '3', body: '[praise] Clean code', severity: 'praise' }),
      makeComment({ id: '4', body: 'Generic comment', severity: 'unknown' }),
    ];

    const groups = parseClaudeReviewComments(comments);

    expect(groups.critical).toHaveLength(1);
    expect(groups.suggestion).toHaveLength(1);
    expect(groups.praise).toHaveLength(1);
    expect(groups.unknown).toHaveLength(1);
  });

  it('falls back to body detection when severity is unknown', () => {
    const comments = [
      makeComment({ id: '1', body: '[critical] This is a bug', severity: 'unknown' }),
    ];

    const groups = parseClaudeReviewComments(comments);
    expect(groups.critical).toHaveLength(1);
  });

  it('handles empty array', () => {
    const groups = parseClaudeReviewComments([]);

    expect(groups.critical).toHaveLength(0);
    expect(groups.suggestion).toHaveLength(0);
    expect(groups.praise).toHaveLength(0);
    expect(groups.unknown).toHaveLength(0);
  });

  it('groups multiple critical comments', () => {
    const comments = [
      makeComment({ id: '1', body: 'There is a bug here', severity: 'critical' }),
      makeComment({ id: '2', body: '[critical] XSS vulnerability', severity: 'critical' }),
    ];

    const groups = parseClaudeReviewComments(comments);
    expect(groups.critical).toHaveLength(2);
  });
});

describe('getReviewSummary', () => {
  it('returns correct counts', () => {
    const groups = parseClaudeReviewComments([
      makeComment({ id: '1', severity: 'critical' }),
      makeComment({ id: '2', severity: 'critical' }),
      makeComment({ id: '3', severity: 'suggestion' }),
      makeComment({ id: '4', severity: 'praise' }),
    ]);

    const summary = getReviewSummary(groups);

    expect(summary.total).toBe(4);
    expect(summary.critical).toBe(2);
    expect(summary.suggestion).toBe(1);
    expect(summary.praise).toBe(1);
    expect(summary.unknown).toBe(0);
  });
});
