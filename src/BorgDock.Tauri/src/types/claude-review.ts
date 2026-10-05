export type CommentSeverity = 'unknown' | 'critical' | 'suggestion' | 'praise';

export interface ClaudeReviewComment {
  id: string;
  author: string;
  body: string;
  sourceBody?: string;
  filePath?: string;
  lineNumber?: number;
  severity: CommentSeverity;
  createdAt: string;
  htmlUrl: string;
}
