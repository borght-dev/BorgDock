import type { ClaudeReviewComment, CommentSeverity } from '@/types';

export interface GroupedReviews {
  critical: ClaudeReviewComment[];
  suggestion: ClaudeReviewComment[];
  praise: ClaudeReviewComment[];
  unknown: ClaudeReviewComment[];
}

/**
 * Groups Claude review comments by severity.
 */
export function parseClaudeReviewComments(comments: ClaudeReviewComment[]): GroupedReviews {
  const groups: GroupedReviews = {
    critical: [],
    suggestion: [],
    praise: [],
    unknown: [],
  };

  for (const comment of comments) {
    const severity =
      comment.severity === 'unknown'
        ? detectSeverityFromBody(comment.body)
        : (comment.severity ?? detectSeverityFromBody(comment.body));

    switch (severity) {
      case 'critical':
        groups.critical.push(comment);
        break;
      case 'suggestion':
        groups.suggestion.push(comment);
        break;
      case 'praise':
        groups.praise.push(comment);
        break;
      default:
        groups.unknown.push(comment);
        break;
    }
  }

  return groups;
}

/**
 * Detects severity from comment body markers.
 */
export function detectSeverityFromBody(body: string): CommentSeverity {
  const lower = body.toLowerCase();

  // Explicit markers
  if (lower.includes('[critical]') || lower.includes('**critical**')) {
    return 'critical';
  }
  if (lower.includes('[warning]')) {
    return 'critical'; // warning maps to critical severity group
  }
  if (lower.includes('[info]')) {
    return 'suggestion'; // info maps to suggestion severity group
  }
  if (lower.includes('[suggestion]') || lower.includes('**suggestion**')) {
    return 'suggestion';
  }
  if (lower.includes('[praise]') || lower.includes('**praise**')) {
    return 'praise';
  }

  // Heuristic fallback
  if (/\b(bug|vulnerability|security issue|breaking change)\b/i.test(body)) {
    return 'critical';
  }
  if (/\b(nice|good job|great|well done|excellent)\b/i.test(body)) {
    return 'praise';
  }
  if (/\b(consider|might want|could also|nit)\b/i.test(body)) {
    return 'suggestion';
  }

  return 'unknown';
}

/**
 * Returns a summary count object for grouped reviews.
 */
export function getReviewSummary(groups: GroupedReviews): {
  total: number;
  critical: number;
  suggestion: number;
  praise: number;
  unknown: number;
} {
  return {
    total:
      groups.critical.length +
      groups.suggestion.length +
      groups.praise.length +
      groups.unknown.length,
    critical: groups.critical.length,
    suggestion: groups.suggestion.length,
    praise: groups.praise.length,
    unknown: groups.unknown.length,
  };
}
