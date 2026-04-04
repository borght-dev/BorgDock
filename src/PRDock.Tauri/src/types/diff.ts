export type DiffLineType = 'add' | 'delete' | 'context' | 'hunk-header';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  noNewline?: boolean;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  sectionName?: string;
  lines: DiffLine[];
}

export interface InlineChange {
  type: 'unchanged' | 'added' | 'deleted';
  text: string;
}

export type FileStatus = 'added' | 'modified' | 'removed' | 'renamed' | 'copied';

export interface DiffFile {
  filename: string;
  previousFilename?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch?: string;
  isBinary: boolean;
  isTruncated: boolean;
  sha: string;
  hunks?: DiffHunk[];
}

export type DiffViewMode = 'unified' | 'split';

export type FileStatusFilter = 'all' | 'added' | 'modified' | 'deleted';

export type HighlightCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function'
  | 'variable'
  | 'operator'
  | 'punctuation'
  | 'constant'
  | 'property'
  | 'tag'
  | 'attribute'
  | 'plain';

export interface HighlightSpan {
  start: number;
  end: number;
  category: HighlightCategory;
}
