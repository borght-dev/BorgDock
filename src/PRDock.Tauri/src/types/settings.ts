export type AuthMethod = 'ghCli' | 'pat';
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

export interface RepoSettings {
  owner: string;
  name: string;
  enabled: boolean;
  worktreeBasePath: string;
  worktreeSubfolder: string;
  fixPromptTemplate?: string;
}

export interface UiSettings {
  sidebarEdge: SidebarEdge;
  sidebarMode: SidebarMode;
  sidebarWidthPx: number;
  theme: ThemeMode;
  globalHotkey: string;
  editorCommand: string;
  runAtStartup: boolean;
  badgeStyle: BadgeStyle;
  indicatorStyle: IndicatorStyle;
}

export interface NotificationSettings {
  toastOnCheckStatusChange: boolean;
  toastOnNewPR: boolean;
  toastOnReviewUpdate: boolean;
}

export interface ClaudeCodeSettings {
  defaultPostFixAction: PostFixAction;
  claudeCodePath?: string;
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
  personalAccessToken?: string;
  pollIntervalSeconds: number;
  favoriteQueryIds: string[];
  lastSelectedQueryId?: string;
  trackedWorkItemIds: number[];
  workingOnWorkItemIds: number[];
  workItemWorktreePaths: Record<number, string>;
  recentWorkItemIds: number[];
}

export interface AppSettings {
  setupComplete: boolean;
  gitHub: GitHubSettings;
  repos: RepoSettings[];
  ui: UiSettings;
  notifications: NotificationSettings;
  claudeCode: ClaudeCodeSettings;
  claudeReview: ClaudeReviewSettings;
  updates: UpdateSettings;
  azureDevOps: AzureDevOpsSettings;
}
