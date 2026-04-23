export type WorktreeStatus = 'clean' | 'dirty' | 'conflict';

export interface WorktreeInfo {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
  status: WorktreeStatus;
  uncommittedCount: number;
  ahead: number;
  behind: number;
  commitSha: string;
}
