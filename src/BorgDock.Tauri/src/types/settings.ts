export type AuthMethod = 'ghCli' | 'pat';
export type AdoAuthMethod = 'azCli' | 'pat';
export type ThemeMode = 'system' | 'light' | 'dark';
export type PostFixAction = 'commitAndNotify' | 'commitOnly' | 'notifyOnly' | 'none';

export interface GitHubSettings {
  authMethod: AuthMethod;
  personalAccessToken?: string;
  pollIntervalSeconds: number;
  username: string;
  /** Team slugs (or `org/slug`) the user belongs to — makes team review
   *  requests count as "waiting on me". Merged with the auto-detected list. */
  teams?: string[];
}

export interface RepoSettings {
  owner: string;
  name: string;
  enabled: boolean;
  worktreeBasePath: string;
  worktreeSubfolder: string;
  fixPromptTemplate?: string;
  favoriteWorktreePaths?: string[];
  /** GitHub CLI login for this repo. Empty means the currently active account. */
  githubAccount?: string;
}

/** A read-only repository whose worktrees are fetched over SSH. */
export interface RemoteWorktreeRepoSettings {
  id: string;
  label: string;
  owner: string;
  name: string;
  sshTarget: string;
  identityFile: string;
  basePath: string;
  enabled: boolean;
}

export interface FilePaletteRoot {
  path: string;
  label?: string;
}

export interface UiSettings {
  theme: ThemeMode;
  globalHotkey: string;
  flyoutHotkey: string;
  editorCommand: string;
  runAtStartup: boolean;
  worktreePaletteFavoritesOnly?: boolean;
  filePaletteActiveRootPath?: string;
  filePaletteFavoritesOnly?: boolean;
  filePaletteRootsCollapsed?: boolean;
  filePaletteChangesCollapsed?: boolean;
  filePaletteChangesMode?: 'head' | 'base' | 'both';
  filePaletteScope?: 'all' | 'changes' | 'filename' | 'content' | 'symbol';
  /** Remembered diff layout for file-viewer windows. Controlled by the Split/Unified buttons and Ctrl+Shift+M. */
  fileViewerDefaultViewMode?: 'unified' | 'split';
  /** Override for the Windows Terminal profile used when launching "Claude". Empty = auto-detect. */
  windowsTerminalProfile?: string;
  quickReviewHotkey: string;
  startMinimizedToTray: boolean;
  restoreLastSelection: boolean;
}

export interface NotificationSettings {
  toastOnCheckStatusChange: boolean;
  toastOnNewPR: boolean;
  toastOnReviewUpdate: boolean;
  toastOnMergeable: boolean;
  onlyMyPRs: boolean;
  playMergeSound: boolean;
  reviewNudgeEnabled: boolean;
  reviewNudgeIntervalMinutes: number;
  reviewNudgeEscalation: boolean;
  deduplicationWindowSeconds: number;
  channels: { tray: boolean; system: boolean; sound: boolean; emailDigest: boolean };
  lastTestFiredAt?: number;
}

export type AgentProvider = 'claude' | 'codex' | 't3';

export interface AgentSettings {
  defaultProvider: AgentProvider;
  fallbackProvider: Exclude<AgentProvider, 't3'>;
  defaultPostFixAction: PostFixAction;
  claudePath?: string;
  codexPath?: string;
  codexModel?: string;
  t3Path?: string;
  t3Model: string;
  t3ModelInstance: string;
}

export interface SummarySettings {
  enabled: boolean;
  provider: Exclude<AgentProvider, 't3'>;
  model: string;
}

export interface ClaudeReviewSettings {
  botUsername: string;
}

export interface UpdateSettings {
  autoCheckEnabled: boolean;
  autoDownload: boolean;
}

export interface AzureDevOpsSettings {
  organization: string;
  project: string;
  authMethod: AdoAuthMethod;
  authAutoDetected: boolean;
  personalAccessToken?: string;
  pollIntervalSeconds: number;
  favoriteQueryIds: string[];
  lastSelectedQueryId?: string;
  trackedWorkItemIds: number[];
  workingOnWorkItemIds: number[];
  workItemWorktreePaths: Record<number, string>;
  recentWorkItemIds: number[];
  linkMatchBy: 'branch' | 'title' | 'both';
  showWorkItemStateOnPrCard: boolean;
  updatePrStatusWhenWiDone: boolean;
}

export interface SqlServerConnection {
  name: string;
  server: string;
  port: number;
  database: string;
  authentication: 'windows' | 'sql';
  username?: string;
  password?: string;
  trustServerCertificate: boolean;
}

export interface SqlSettings {
  connections: SqlServerConnection[];
  lastUsedConnection?: string;
  defaultConnectionName?: string;
  readOnlyByDefault: boolean;
  confirmDestructiveWithoutWhere: boolean;
}

export interface PrDetailSettings {
  windowState?: { x: number; y: number; width: number; height: number };
}

export interface AppSettings {
  /** Bumped by the Rust side after one-off migrations; see settings::migrate. */
  schemaVersion?: number;
  setupComplete: boolean;
  gitHub: GitHubSettings;
  repos: RepoSettings[];
  remoteWorktreeRepos?: RemoteWorktreeRepoSettings[];
  ui: UiSettings;
  notifications: NotificationSettings;
  agents?: AgentSettings;
  summaries?: SummarySettings;
  claudeReview: ClaudeReviewSettings;
  updates: UpdateSettings;
  prDetail?: PrDetailSettings;
  azureDevOps: AzureDevOpsSettings;
  sql: SqlSettings;
  filePaletteRoots?: FilePaletteRoot[];
  settingsWindow?: { x: number; y: number; width: number; height: number };
}
