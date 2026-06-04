// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

import type { CheckRun } from '../../src/types/check-run';
import type { ClaudeReviewComment } from '../../src/types/claude-review';
import type {
  PullRequest,
  PullRequestCommit,
  PullRequestFileChange,
  PullRequestWithChecks,
} from '../../src/types/pull-request';
import type { ReviewThread } from '../../src/types/review-thread';
import type { Release } from '../../src/types/whats-new';
import type { WorkItem, WorkItemComment } from '../../src/types/work-item';

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export type PluginStoreBehavior = 'normal' | 'pending' | 'reject';

export type InvokeResponse = unknown | ((args: unknown) => unknown);

export interface MonitorState {
  size: { width: number; height: number };
  scaleFactor: number;
}

export interface WindowSizeState {
  width: number;
  height: number;
  scaleFactor: number;
  // Phase 4 additions — outer-position state for getCurrentWindow().outerPosition / setPosition.
  x: number;
  y: number;
}

// Phase 6 — work item scenario shape
export interface WorkItemScenario {
  workItem: WorkItem | null;
  states: string[] | null;
  comments: WorkItemComment[] | null;
  loadBehavior: 'normal' | 'pending' | 'reject';
  loadError: string | null;
  statesBehavior: 'normal' | 'reject';
  commentsBehavior: 'normal' | 'pending' | 'reject';
  saveBehavior: 'normal' | 'pending' | 'reject';
  deleteBehavior: 'normal' | 'reject';
  addCommentBehavior: 'normal' | 'reject';
}

// Phase 6 — plugin-dialog responses (each can be a literal or a function).
export interface PluginDialogControl {
  openResponse?: string | string[] | null | ((opts?: unknown) => string | string[] | null);
  saveResponse?: string | null | ((opts?: unknown) => string | null);
  askResponse?: boolean | ((text: string, opts?: unknown) => boolean);
  confirmResponse?: boolean | ((text: string, opts?: unknown) => boolean);
}

// Phase 6 — plugin-fs in-memory filesystem.
export interface PluginFsControl {
  writes: Map<string, Uint8Array>;
  reads: Map<string, Uint8Array>;
  failNextWrite: boolean;
}

// Phase 8 — work-item palette scenario shape
export interface WorkItemPaletteScenario {
  workItems: WorkItem[];
  assignedToMe: WorkItem[];
  searchPool: WorkItem[];
  browseBehavior: 'normal' | 'pending' | 'reject';
  assignedToMeBehavior: 'normal' | 'pending' | 'reject';
  searchBehavior: 'normal' | 'pending' | 'reject';
}

// Phase 8 — record of new WebviewWindow(...) constructions during a story.
export interface WebviewWindowRecord {
  label: string;
  options: Record<string, unknown>;
}

// Phase 11 — raw review shape (mirrors buildDiscussionItems.ts)
export interface RawReview {
  id: number;
  state: string;
  body: string | null;
  submitted_at: string;
  user: { login: string } | null;
}

// Phase 11 — github service responses
export type GithubResponses = {
  getOpenPRs?:
    | PullRequest[]
    | ((args: {
        owner: string;
        repo: string;
      }) => PullRequest[] | Promise<PullRequest[]> | Promise<never>);
  getCheckRunsForRef?:
    | CheckRun[]
    | ((args: { ref: string }) => CheckRun[] | Promise<CheckRun[]> | Promise<never>);
  pollOpenPrsAggregate?:
    | PullRequestWithChecks[]
    | ((args: {
        owner: string;
        repo: string;
      }) => PullRequestWithChecks[] | Promise<PullRequestWithChecks[]> | Promise<never>);
  tokenGetter?: () => string | Promise<string>;
  // Phase 11 / FilesTab additions
  getPRFiles?:
    | PullRequestFileChange[]
    | (() => PullRequestFileChange[] | Promise<PullRequestFileChange[]>);
  getCommitFiles?:
    | PullRequestFileChange[]
    | (() => PullRequestFileChange[] | Promise<PullRequestFileChange[]>);
  getPRCommits?: PullRequestCommit[] | (() => PullRequestCommit[] | Promise<PullRequestCommit[]>);
  getReviewThreads?: ReviewThread[] | (() => ReviewThread[] | Promise<ReviewThread[]>);
  // DiscussionTab additions
  getReviews?: RawReview[] | (() => RawReview[] | Promise<RawReview[]>);
  getAllComments?:
    | ClaudeReviewComment[]
    | (() => ClaudeReviewComment[] | Promise<ClaudeReviewComment[]>);
};

// Phase 11 — pr-actions overrides
export type PrActionResponses = Record<
  string,
  '__throw__' | '__fail__' | ((args: unknown) => unknown)
>;

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, InvokeResponse>;

  // Phase 2 fields
  windowState: { isMaximized: boolean; title: string };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3 additions
  windowSize: WindowSizeState;
  monitorState: MonitorState | null;

  // Phase 4 additions
  clipboardWrites: string[];

  // Phase 6 fields
  workItemScenario: WorkItemScenario;
  pluginDialog: PluginDialogControl;
  pluginFs: PluginFsControl;

  // Phase 8 fields
  workItemPaletteScenario: WorkItemPaletteScenario;
  webviewWindowsCreated: WebviewWindowRecord[];

  // Phase 11 fields
  githubResponses: GithubResponses;
  prActionResponses: PrActionResponses;

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

const DEFAULT_WINDOW_SIZE: WindowSizeState = {
  width: 480,
  height: 600,
  scaleFactor: 1,
  x: 100,
  y: 100,
};

function defaultScenario(): WorkItemScenario {
  return {
    workItem: null,
    states: null,
    comments: null,
    loadBehavior: 'normal',
    loadError: null,
    statesBehavior: 'normal',
    commentsBehavior: 'normal',
    saveBehavior: 'normal',
    deleteBehavior: 'normal',
    addCommentBehavior: 'normal',
  };
}

function defaultPaletteScenario(): WorkItemPaletteScenario {
  return {
    workItems: [],
    assignedToMe: [],
    searchPool: [],
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}

function createControl(): StorybookTauriControl {
  const ctrl: StorybookTauriControl = {
    channels: new Map(),
    invocations: [],
    invokeResponses: {},

    windowState: { isMaximized: false, title: '' },
    pluginStore: new Map(),
    pluginStoreBehavior: 'normal',
    appVersion: null,
    releasesOverride: null,

    windowSize: { ...DEFAULT_WINDOW_SIZE },
    monitorState: null,

    clipboardWrites: [],
    workItemScenario: defaultScenario(),
    pluginDialog: {},
    pluginFs: { writes: new Map(), reads: new Map(), failNextWrite: false },

    workItemPaletteScenario: defaultPaletteScenario(),
    webviewWindowsCreated: [],

    // Phase 11
    githubResponses: {},
    prActionResponses: {},

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];

      ctrl.windowState.isMaximized = false;
      ctrl.windowState.title = '';
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;
      ctrl.windowSize.width = DEFAULT_WINDOW_SIZE.width;
      ctrl.windowSize.height = DEFAULT_WINDOW_SIZE.height;
      ctrl.windowSize.scaleFactor = DEFAULT_WINDOW_SIZE.scaleFactor;
      ctrl.windowSize.x = DEFAULT_WINDOW_SIZE.x;
      ctrl.windowSize.y = DEFAULT_WINDOW_SIZE.y;
      ctrl.monitorState = null;
      ctrl.clipboardWrites.length = 0;

      ctrl.workItemScenario = defaultScenario();
      ctrl.pluginDialog = {};
      ctrl.pluginFs.writes.clear();
      ctrl.pluginFs.reads.clear();
      ctrl.pluginFs.failNextWrite = false;

      ctrl.workItemPaletteScenario = defaultPaletteScenario();
      ctrl.webviewWindowsCreated.length = 0;

      // Phase 11
      ctrl.githubResponses = {};
      ctrl.prActionResponses = {};
    },
    emit(channel, payload) {
      const set = ctrl.channels.get(channel);
      if (!set) return;
      for (const cb of set) cb({ payload });
    },
  };
  return ctrl;
}

export function getControl(): StorybookTauriControl {
  if (typeof window === 'undefined') {
    throw new Error('storybook tauri mock used outside browser');
  }
  if (!window.__borgdock_storybook_tauri) {
    window.__borgdock_storybook_tauri = createControl();
  }
  return window.__borgdock_storybook_tauri;
}
