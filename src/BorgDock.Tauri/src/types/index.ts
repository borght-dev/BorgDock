export type {
  CheckRun,
  CheckSuite,
  ParsedError,
  WorkflowJob,
} from './check-run';
export type {
  ClaudeReviewComment,
  CommentSeverity,
} from './claude-review';
export type {
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffLineType,
  DiffViewMode,
  FileStatus,
  FileStatusFilter,
  HighlightCategory,
  HighlightSpan,
  InlineChange,
} from './diff';
export type {
  InAppNotification,
  NotificationAction,
  NotificationSeverity,
} from './notification';
export type {
  OverallStatus,
  PullRequest,
  PullRequestCommit,
  PullRequestFileChange,
  PullRequestWithChecks,
  ReviewStatus,
} from './pull-request';
export type {
  AdoAuthMethod,
  AppSettings,
  AuthMethod,
  AzureDevOpsSettings,
  ClaudeApiSettings,
  ClaudeCodeSettings,
  ClaudeReviewSettings,
  GitHubSettings,
  NotificationSettings,
  PostFixAction,
  RepoPriority,
  RepoSettings,
  SidebarEdge,
  SidebarMode,
  SqlServerConnection,
  SqlSettings,
  ThemeMode,
  UiSettings,
  UpdateSettings,
} from './settings';
export type { UpdateInfo } from './update';
export type { Highlight, Kind, Release } from './whats-new';
export type {
  AdoQuery,
  AdoQueryResult,
  AdoQueryWorkItemRef,
  DynamicFieldItem,
  FieldSection,
  JsonPatchOperation,
  WorkItem,
  WorkItemAttachment,
  WorkItemComment,
  WorkItemRelation,
} from './work-item';
export type { WorktreeInfo } from './worktree';
