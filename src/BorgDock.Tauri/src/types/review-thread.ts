export type ReviewVerdict = 'approved' | 'changes-requested' | 'commented';

export interface ReviewThreadComment {
  /** GraphQL node id. */
  id: string;
  /** REST id (PullRequestReviewComment.databaseId) — used for in_reply_to_id when posting replies. */
  databaseId: number;
  author: string;
  authorIsBot: boolean;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Severity heuristic from body. */
  severity?: 'critical' | 'suggestion' | 'praise';
}

export interface ReviewThreadSnippetLine {
  /** New-side line number, or null for context-only / deleted lines. */
  lineNumber: number | null;
  marker: '+' | '-' | ' ';
  text: string;
  /** True for the anchor line — yellow-highlighted by the UI. */
  isAnchor: boolean;
}

export interface ReviewThread {
  /** GraphQL node id of the thread. Used to resolve / unresolve. */
  id: string;
  filePath: string;
  /** New-side line the thread anchors to. */
  line: number;
  isResolved: boolean;
  resolvedBy?: string;
  /** Up to ~6 lines of diff context centered on the anchor. */
  snippet: ReviewThreadSnippetLine[];
  comments: ReviewThreadComment[];
}
