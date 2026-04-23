export type AuthMethod = 'ghCli' | 'pat';
export type AdoAuthMethod = 'azCli' | 'pat';
export type SidebarEdge = 'left' | 'right';
export type SidebarMode = 'pinned' | 'floating';
export type ThemeMode = 'system' | 'light' | 'dark';
export type BadgeStyle =
  | 'GlassCapsule'
  | 'MinimalNotch'
  | 'FloatingIsland'
  | 'LiquidMorph'
  | 'SpectralBar';
export type IndicatorStyle = 'SegmentRing' | 'SignalDots';
export type PostFixAction = 'commitAndNotify' | 'commitOnly' | 'notifyOnly' | 'none';

export interface GitHubSettings {
  authMethod: AuthMethod;
  personalAccessToken?: string;
  pollIntervalSeconds: number;
  username: string;
}

export type RepoPriority = 'high' | 'normal' | 'low';

export interface RepoSettings {
  owner: string;
  name: string;
  enabled: boolean;
  worktreeBasePath: string;
  worktreeSubfolder: string;
  fixPromptTemplate?: string;
  favoriteWorktreePaths?: string[];
}

export interface FilePaletteRoot {
  path: string;
  label?: string;
}

export interface UiSettings {
  sidebarEdge: SidebarEdge;
  sidebarMode: SidebarMode;
  sidebarWidthPx: number;
  theme: ThemeMode;
  globalHotkey: string;
  editorCommand: string;
  runAtStartup: boolean;
  badgeEnabled: boolean;
  badgeStyle: BadgeStyle;
  indicatorStyle: IndicatorStyle;
  worktreePaletteFavoritesOnly?: boolean;
  filePaletteActiveRootPath?: string;
  filePaletteFavoritesOnly?: boolean;
  filePaletteRootsCollapsed?: boolean;
  filePaletteChangesCollapsed?: { local: boolean; vsBase: boolean };
  /** Remembered diff layout for file-viewer windows. Controlled by the Split/Unified buttons and Ctrl+Shift+M. */
  fileViewerDefaultViewMode?: 'unified' | 'split';
  /** Override for the Windows Terminal profile used when launching "Claude". Empty = auto-detect. */
  windowsTerminalProfile?: string;
}

export interface NotificationSettings {
  toastOnCheckStatusChange: boolean;
  toastOnNewPR: boolean;
  toastOnReviewUpdate: boolean;
  toastOnMergeable: boolean;
  onlyMyPRs: boolean;
  reviewNudgeEnabled: boolean;
  reviewNudgeIntervalMinutes: number;
  reviewNudgeEscalation: boolean;
  deduplicationWindowSeconds: number;
}

export interface ClaudeCodeSettings {
  defaultPostFixAction: PostFixAction;
  claudeCodePath?: string;
}

export interface ClaudeApiSettings {
  apiKey?: string;
  model: string;
  maxTokens: number;
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
}

export interface AppSettings {
  setupComplete: boolean;
  gitHub: GitHubSettings;
  repos: RepoSettings[];
  ui: UiSettings;
  notifications: NotificationSettings;
  claudeCode: ClaudeCodeSettings;
  claudeApi: ClaudeApiSettings;
  claudeReview: ClaudeReviewSettings;
  updates: UpdateSettings;
  azureDevOps: AzureDevOpsSettings;
  sql: SqlSettings;
  repoPriority: Record<string, RepoPriority>;
  filePaletteRoots?: FilePaletteRoot[];
}
