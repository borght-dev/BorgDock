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
  /** Deployments the activity journal follows for this repository. */
  deployments?: RepoDeployments;
}

export interface RepoDeployments {
  enabled: boolean;
  /** Glob patterns such as `dev`, `*-a`, `acc*`, `prod*`. */
  environments: string[];
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
  favoriteWorktreePaths?: string[];
}

export interface UiSettings {
  theme: ThemeMode;
  globalHotkey: string;
  flyoutHotkey: string;
  editorCommand: string;
  runAtStartup: boolean;
  worktreePaletteFavoritesOnly?: boolean;
  /** Override for the Windows Terminal profile used when launching "Claude". Empty = auto-detect. */
  windowsTerminalProfile?: string;
  quickReviewHotkey: string;
  startMinimizedToTray: boolean;
  restoreLastSelection: boolean;
  /** PR list row layout in the main window. comfortable = two-line rows, compact = single-line table. */
  prDensity?: PrDensity;
  /** Collapse every transition to instant, on top of the OS reduced-motion preference. Puts `.reduce-motion` on <html>. */
  reduceMotion?: boolean;
  /** Focus section layout: a ranked list or the four-column board. Default `list`. */
  focusLayout?: FocusLayout;
  /** An open PR with no update for this many days counts as stale (Focus, PR rows). Default 7. */
  staleAfterDays?: number;
}

export type FocusLayout = 'list' | 'board';

export type PrDensity = 'comfortable' | 'compact';

export interface NotificationSettings {
  toastOnNewPR: boolean;
  onlyMyPRs: boolean;
  playMergeSound: boolean;
  reviewNudgeEnabled: boolean;
  reviewNudgeIntervalMinutes: number;
  reviewNudgeEscalation: boolean;
  deduplicationWindowSeconds: number;
  /** Sound for merges; the other channels went with the activity journal. */
  channels: { sound: boolean };
  lastTestFiredAt?: number;
  /** The activity journal: popups, push and read behaviour per category. */
  activity?: ActivityNotificationSettings;
}

/** One category's channels. Absent: the category's default (`services/activity/policy.ts`). */
export interface ActivityCategoryChannels {
  popup?: boolean;
  push?: boolean;
}

/** The phone channel. Its webhook URL and token live in the keychain, not here. */
export interface ActivityPushSettings {
  enabled: boolean;
  preset: 'home-assistant';
  /** Push once I have been away from the laptop this long. */
  awayMinutes: number;
  /** Send "W3 asks a question" without the item's title. */
  hideTitles: boolean;
}

export interface ActivityNotificationSettings {
  /** Category id (`agent.question`, `pr.review`, …) to its channels. */
  categories: Partial<Record<string, ActivityCategoryChannels>>;
  /** A visit to a thread in T3 marks its entries read. */
  seenInT3: boolean;
  /** Opening a PR, item, workstream or CI group marks its entries read. */
  markReadOnOpen: boolean;
  /** The needs-you count on the taskbar icon. */
  taskbarBadge: boolean;
  push: ActivityPushSettings;
}

/** Related CI failures: whether evidence is collected and within which limits. */
export interface CiFailureSettings {
  enabled: boolean;
  includeDefaultBranch: boolean;
  crossRepoSuggestions: boolean;
  retentionDays: number;
  maxLogMib: number;
  logTimeoutSeconds: number;
  dailyEvidenceLimit: number;
  leaseHours: number;
  notifyThreshold: number;
}

/** Terminal agents used by Fix / Resolve / Monitor. T3 is not a provider:
 * "Open a new thread in T3" is its own action (see services/t3-thread.ts). */
export type AgentProvider = 'claude' | 'codex';

/** A T3 Code server on another machine that Dispatch follows. */
export interface T3HostSettings {
  /** Never changes once set: it prefixes the ids of the host's threads and projects. */
  id: string;
  label: string;
  /** Where the server answers, e.g. `http://mac-mini:3773`. */
  baseUrl: string;
}

export interface AgentSettings {
  defaultProvider: AgentProvider;
  defaultPostFixAction: PostFixAction;
  claudePath?: string;
  codexPath?: string;
  codexModel?: string;
  /** Override for the T3 Code executable. */
  t3Path?: string;
  /** Model used for new T3 threads when T3 has no default of its own yet. */
  t3Model: string;
  t3ModelInstance: string;
  /**
   * First messages Dispatch starts an agent with, per way of beginning.
   * Placeholders: `{id}`, `{title}`, `{branch}`; `{items}` for sync;
   * `{iteration}`, `{assigned}` for suggest. An empty one uses the default.
   */
  dispatchPrompts?: {
    pickup?: string;
    qa?: string;
    done?: string;
    sync?: string;
    suggest?: string;
    /** `{brief}`, `{title}`. */
    workstreamReview?: string;
    /** `{brief}`, `{nextAction}`, `{title}`. */
    workstreamWork?: string;
  };
  /** When "Sync all" runs by itself. Runs while BorgDock is open. */
  dispatchSyncSchedule?: DispatchSyncSchedule;
  /** T3 servers on other machines. The one on this machine is always followed. */
  t3Hosts?: T3HostSettings[];
}

export interface DispatchSyncSchedule {
  enabled: boolean;
  /** Local time of day, `HH:MM`. */
  time: string;
  /** Days it runs on, 0 = Sunday. */
  weekdays: number[];
}

export interface SummarySettings {
  enabled: boolean;
  provider: AgentProvider;
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
  ciFailures?: CiFailureSettings;
  settingsWindow?: { x: number; y: number; width: number; height: number };
  workstreams?: WorkstreamSettings;
}

export interface WorkstreamSettings {
  /** A folder a sync client shares between machines. Empty: this machine only. */
  folder?: string;
  /** What this machine is called in a workstream's log. Empty: the computer's name. */
  deviceLabel?: string;
}
