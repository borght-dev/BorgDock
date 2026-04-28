export type FileChangeStatus =
  | 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'submodule';

export interface FileChange {
  path: string;
  previousPath: string | null;
  status: FileChangeStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  isSubmodule: boolean;
}

export type BaseBranchSource =
  | 'origin-head' | 'init-default' | 'fallback-main' | 'fallback-master' | 'unknown';

export interface WorktreeChangeSet {
  vsHead: FileChange[];
  vsBase: FileChange[];
  baseBranch: string;
  baseBranchSource: BaseBranchSource;
  detachedHead: boolean;
  mergeBaseUnavailable: boolean;
}

export interface BinaryMarker {
  oldSize: number | null;
  newSize: number | null;
}

export interface RustDiffLine {
  kind: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface RustDiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: RustDiffLine[];
}

export interface UnifiedWorktreeDiff {
  filePath: string;
  previousPath: string | null;
  hunks: RustDiffHunk[];
  binary: BinaryMarker | null;
  isSubmodule: boolean;
}

export type DiffSource = 'vs-head' | 'vs-base';
