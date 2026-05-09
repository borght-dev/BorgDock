// src/components/main/__fixtures__/main-window-data.tsx

import type { Decorator } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useInitStore } from '@/stores/initStore';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type {
  AppSettings,
  CheckRun,
  PullRequestWithChecks,
  WorkItem,
  WorkItemRelation,
} from '@/types';
import { type GithubResponses, getControl } from '../../../../.storybook/mocks/control';

// ── Deep-merge helper ─────────────────────────────────────────

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

function deepMerge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base;
  if (Array.isArray(base)) return (over as unknown as T) ?? base;
  if (typeof base !== 'object' || base === null) return (over as unknown as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k] as never, v as never);
  }
  return out as T;
}

// ── Store baselines (snapshot once at module load) ────────────

export const SETTINGS_BASELINE: AppSettings =
  (useSettingsStore.getState().settings as AppSettings | undefined) ?? ({} as AppSettings);
const UI_BASELINE = useUiStore.getState();
const INIT_BASELINE = useInitStore.getState();
const PR_BASELINE = usePrStore.getState();
const ONBOARDING_BASELINE = useOnboardingStore.getState();
const WORKITEMS_BASELINE = useWorkItemsStore.getState();
const QUICK_REVIEW_BASELINE = useQuickReviewStore.getState();

// ── Animation freezer decorator ───────────────────────────────

const FREEZE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

export const freezeAnimations: Decorator = (Story) => (
  <>
    <style>{FREEZE_ANIMATIONS_CSS}</style>
    {Story()}
  </>
);

// ── MainWindowFrame ───────────────────────────────────────────

// Production main window opens at 480x900 (sidebar) per
// src-tauri/src/lib.rs. The frame mirrors that shape so stories feel
// like the real sidebar instead of the default fullscreen iframe.

const FRAME_STYLE = `
.storybook-main-frame .h-screen { height: 100% !important; }
.storybook-main-frame .w-screen { width: 100% !important; }
`;

export function MainWindowFrame({
  children,
  width = 480,
  height = 900,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        background: 'var(--color-app-background, #1a1a1a)',
      }}
    >
      <style>{FRAME_STYLE}</style>
      <div
        className="storybook-main-frame"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
          position: 'relative',
        }}
      >
        <div className="flex h-full flex-col bg-[var(--color-background)]">
          <div className="relative flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Larger frame for the README hero composition (App + PR Detail).
export function HeroCompositionFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        background: 'var(--color-app-background, #1a1a1a)',
      }}
    >
      <style>{FRAME_STYLE}</style>
      <div
        className="storybook-main-frame"
        style={{
          display: 'grid',
          gridTemplateColumns: '480px 1fr',
          gap: '16px',
          width: '1600px',
          height: '1000px',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Animated composition frame: first window on the left, second window
// slides in from the right when `open` flips to true.
export interface SlideInCompositionFrameProps {
  /** The primary window (left column). */
  children: ReactNode;
  /** The secondary window — starts off-screen, slides in when `open` is true. */
  slideIn: ReactNode;
  /** Left-column width in px. Default 480. */
  leftWidth?: number;
  /** Frame height in px. Default 1000. */
  height?: number;
  /** Total frame width in px (left + right). Default 1600. */
  totalWidth?: number;
  /** When true, the slide-in column translates to 0 (visible). Default false. */
  open?: boolean;
}

// Subtle desktop-style gradient — reads as "this is happening on a desktop"
// without the harsh black bars the previous solid-dark backdrop produced.
const GALLERY_BACKDROP =
  'radial-gradient(ellipse at 30% 0%, #5b3aa0 0%, #2a1f54 35%, #14132a 100%)';

export function SlideInCompositionFrame({
  children,
  slideIn,
  leftWidth = 480,
  height = 1000,
  totalWidth = 1600,
  open = false,
}: SlideInCompositionFrameProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '32px',
        background: GALLERY_BACKDROP,
      }}
    >
      <style>{FRAME_STYLE}</style>
      <div
        className="storybook-main-frame"
        style={{
          display: 'grid',
          gridTemplateColumns: `${leftWidth}px 1fr`,
          gap: '24px',
          width: `${totalWidth}px`,
          height: `${height}px`,
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            overflow: 'hidden',
            borderRadius: 12,
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06)',
          }}
        >
          {children}
        </div>
        <div
          data-slide-in=""
          style={{
            height: '100%',
            overflow: 'hidden',
            borderRadius: 12,
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06)',
            transform: open ? 'translateX(0)' : 'translateX(110%)',
            transition: 'transform 700ms cubic-bezier(0.22, 0.7, 0.18, 1)',
          }}
        >
          {slideIn}
        </div>
      </div>
    </div>
  );
}

// CrossWindowDecorator wires a SlideInCompositionFrame to a callback on
// window so the story play function (or an intercepted invoke) can open it.
//
// Usage in a decorator:
//   (Story) => <CrossWindowShell left={<Story />} right={<PrDetailApp />} ... />
//
// The play function calls `window.__BORGDOCK_SLIDE_OPEN__()` to trigger.
export function CrossWindowShell({
  left,
  right,
  leftWidth = 480,
  height = 1000,
  totalWidth = 1600,
}: {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: number;
  height?: number;
  totalWidth?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__BORGDOCK_SLIDE_OPEN__ = () => setOpen(true);
    return () => {
      delete (window as unknown as Record<string, unknown>).__BORGDOCK_SLIDE_OPEN__;
    };
  }, []);

  return (
    <SlideInCompositionFrame
      open={open}
      slideIn={right}
      leftWidth={leftWidth}
      height={height}
      totalWidth={totalWidth}
    >
      {left}
    </SlideInCompositionFrame>
  );
}

// ── PR fixtures ───────────────────────────────────────────────

// The pr-store holds PullRequestWithChecks (not bare PullRequest).
// makePr builds a PullRequestWithChecks from field overrides so callers
// don't need to know the wrapper shape.

const BASE_PR_WITH_CHECKS: PullRequestWithChecks = {
  pullRequest: {
    number: 42,
    title: 'feat: storybook phase 12 main window catalog',
    headRef: 'storybook-phase12-main-sidebar',
    headSha: '0123456789abcdef0123456789abcdef01234567',
    baseRef: 'master',
    authorLogin: 'borght-dev',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    state: 'open',
    createdAt: '2026-05-08T09:00:00Z',
    updatedAt: '2026-05-08T11:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/borght-dev/BorgDock/pull/42',
    body: '',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    reviewStatus: 'pending',
    commentCount: 0,
    labels: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commitCount: 1,
    requestedReviewers: [],
  },
  checks: [],
  overallStatus: 'green',
  failedCheckNames: [],
  pendingCheckNames: [],
  passedCount: 0,
  skippedCount: 0,
};

export function makePr(overrides?: DeepPartial<PullRequestWithChecks>): PullRequestWithChecks {
  return deepMerge(BASE_PR_WITH_CHECKS, overrides);
}

export const PRS_CANONICAL: PullRequestWithChecks[] = [
  makePr({
    pullRequest: {
      number: 41,
      title: 'feat: add focus section keyboard nav',
      authorLogin: 'borght-dev',
      repoName: 'BorgDock',
    },
  }),
  makePr({ pullRequest: { number: 42, title: 'feat: storybook phase 12 main window catalog' } }),
  makePr({
    pullRequest: { number: 43, title: 'fix: rate-limit banner copy', reviewStatus: 'approved' },
  }),
  makePr({
    pullRequest: {
      number: 200,
      title: 'chore: bump deps',
      repoOwner: 'borght-dev',
      repoName: 'borgdock-site',
      commentCount: 2,
    },
  }),
];

export const PRS_MANY_REPOS: PullRequestWithChecks[] = [
  ...PRS_CANONICAL,
  makePr({
    pullRequest: { number: 18, repoName: 'docs-experiments', title: 'docs: revamp install guide' },
  }),
  makePr({
    pullRequest: {
      number: 9,
      repoName: 'release-tooling',
      title: 'feat: add release notes generator',
    },
  }),
  makePr({
    pullRequest: { number: 7, repoName: 'ci-utils', title: 'fix: cache miss in storybook job' },
  }),
];

export const PRS_WITH_FAILURES: PullRequestWithChecks[] = [
  makePr({
    pullRequest: { number: 50, title: 'feat: triggers a flaky test' },
    overallStatus: 'red',
  }),
  makePr({
    pullRequest: { number: 51, title: 'fix: hangs on Windows', mergeable: false },
    overallStatus: 'red',
  }),
];

export const PRS_MERGE_CONFLICTS: PullRequestWithChecks[] = [
  makePr({ pullRequest: { number: 60, mergeable: false, title: 'feat: conflicts with main' } }),
  makePr({ pullRequest: { number: 61, mergeable: false, title: 'feat: also conflicts' } }),
];

export const PRS_EMPTY: PullRequestWithChecks[] = [];

// PRs designed to populate the Focus list. computePriorityScores in
// services/priority-scoring.ts gives a non-zero score (and therefore
// inclusion in usePrStore.focusPrs) when at least one of:
//   - own PR + green + approved + mergeable + !draft  → readyToMerge (45)
//   - own PR + red checks                              → myPrRedChecks (20)
//   - own PR + changesRequested                        → myPrChangesRequested (15)
//   - own PR + (red OR changesRequested) + stale >24h  → myPrStale (10)
//   - reviewer requested by username                   → reviewRequested (15)
//   - any PR + updated >24h ago                        → staleness (2-10)
//   - others' PR + red                                 → othersRedChecks (5)
// Stories using PRS_FOCUS_DEMO must also seed `gitHub.username` so the
// `isMine` check fires.
export const PRS_FOCUS_DEMO: PullRequestWithChecks[] = [
  // (1) Own PR ready to merge — readyToMerge (45)
  makePr({
    pullRequest: {
      number: 43,
      title: 'fix: rate-limit banner copy',
      reviewStatus: 'approved',
      authorLogin: 'borght-dev',
    },
  }),
  // (2) Own PR with failing checks + stale — myPrRedChecks (20) + myPrStale (10) + staleness
  makePr({
    pullRequest: {
      number: 50,
      title: 'feat: triggers a flaky test on Windows',
      authorLogin: 'borght-dev',
      updatedAt: '2026-05-04T09:00:00Z',
    },
    overallStatus: 'red',
    failedCheckNames: ['CI / test'],
  }),
  // (3) Reviewer requested — reviewRequested (15)
  makePr({
    pullRequest: {
      number: 51,
      title: 'feat: refactor legacy auth middleware',
      authorLogin: 'someone-else',
      requestedReviewers: ['borght-dev'],
      updatedAt: '2026-05-06T09:00:00Z',
    },
  }),
];

// ── Check fixtures ────────────────────────────────────────────

const BASE_CHECKS: CheckRun[] = [
  {
    id: 1001,
    name: 'CI / build',
    status: 'success',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1001',
    checkSuiteId: 9000,
  },
  {
    id: 1002,
    name: 'CI / test',
    status: 'success',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1002',
    checkSuiteId: 9000,
  },
];

const FAILING_CHECKS: CheckRun[] = [
  {
    id: 2001,
    name: 'CI / build',
    status: 'failure',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/2001',
    checkSuiteId: 9000,
  },
  {
    id: 2002,
    name: 'CI / test',
    status: 'success',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/2002',
    checkSuiteId: 9000,
  },
];

export const CHECKS_FOR_REF: Record<string, CheckRun[]> = {
  default: BASE_CHECKS,
  failing: FAILING_CHECKS,
};

// ── Work-item fixtures ────────────────────────────────────────

// WorkItem stores display fields in the ADO-style `fields` Record.
// Common field keys: System.Title, System.State, System.WorkItemType,
// System.AssignedTo, System.AreaPath, System.IterationPath, System.ChangedDate.

const BASE_WORK_ITEM_RELATIONS: WorkItemRelation[] = [];

const BASE_WORK_ITEM: WorkItem = {
  id: 1234,
  rev: 1,
  url: 'https://dev.azure.com/borght/BorgDock/_apis/wit/workItems/1234',
  htmlUrl: 'https://dev.azure.com/borght/BorgDock/_workitems/edit/1234',
  fields: {
    'System.Title': 'Investigate sidebar polling cadence',
    'System.State': 'Active',
    'System.WorkItemType': 'Task',
    'System.AssignedTo': 'koen@borgdock.dev',
    'System.IterationPath': 'BorgDock\\Sprint 12',
    'System.AreaPath': 'BorgDock\\Frontend',
    'System.ChangedDate': '2026-05-07T13:00:00Z',
  },
  relations: BASE_WORK_ITEM_RELATIONS,
};

export function makeWorkItem(overrides?: DeepPartial<WorkItem>): WorkItem {
  return deepMerge(BASE_WORK_ITEM, overrides);
}

export const WORK_ITEMS_CANONICAL: WorkItem[] = [
  makeWorkItem({ id: 1234, fields: { 'System.Title': 'Investigate sidebar polling cadence' } }),
  makeWorkItem({
    id: 1235,
    fields: { 'System.Title': 'Wire React Compiler escape hatch into docs', 'System.State': 'New' },
  }),
  makeWorkItem({
    id: 1236,
    fields: { 'System.Title': 'Audit grammar wasm sizes', 'System.State': 'Resolved' },
  }),
];

// ── Focus / quick-review fixtures ─────────────────────────────

// FocusList consumes a derived priority shape from PR data — there's no
// separate "focus store" with prebuilt priority objects. Stories drive
// the focus list by populating usePrStore + the priority-derivation logic
// under hooks/usePriorities.ts. For story purposes we set the same PRs
// that power PrsCanonical and let the section render its own derivation.

// ── Decorator ─────────────────────────────────────────────────

export interface WithMainWindowOptions {
  /** Settings overrides — deep-merged into SETTINGS_BASELINE so nested
   *  sub-objects (gitHub, ui, notifications, etc.) only patch the keys
   *  the story specifies. */
  settings?: DeepPartial<AppSettings>;
  /** Override init state (default: complete). Set { isComplete: false } to render splash. */
  init?: Partial<{ isComplete: boolean }>;
  /** Override UI store (default: section='focus'). */
  ui?: Partial<{ activeSection: 'focus' | 'prs' | 'workitems' }>;
  /** Pull requests to seed into usePrStore. Default: PRS_CANONICAL. */
  pullRequests?: PullRequestWithChecks[];
  /** Work items to seed into useWorkItemsStore. Default: WORK_ITEMS_CANONICAL. */
  workItems?: WorkItem[];
  /** Tauri invoke responses (e.g. load_settings, set_badge_visible). */
  invokeResponses?: Record<string, unknown>;
  /** GitHub service mock responses. */
  githubResponses?: Partial<GithubResponses>;
  /** Force the App.tsx fade-out branch by toggling the local fadingOut state to true.
   *  Implementation note: App.tsx uses a local useState; to simulate fadingOut without
   *  modifying the component, the FadingOut story sets isInitComplete=true and then
   *  immediately toggles fadingOut via the fade-out useEffect path.
   *  This option is reserved for future use; FadingOut handles its own setup. */
  forceFadingOut?: boolean;
}

const DEFAULT_INVOKES: Record<string, unknown> = {
  load_settings: undefined,
  cache_init: undefined,
  set_badge_visible: undefined,
  resize_badge: undefined,
  show_setup_wizard: undefined,
  open_settings_window: undefined,
  register_user_hotkeys: undefined,
  unregister_hotkey: undefined,
};

export function withMainWindow(options: WithMainWindowOptions = {}): Decorator {
  return (Story) => {
    const ctrl = getControl();

    // Clear any keys left over from a prior story before re-seeding. Without
    // this, invokeResponses / githubResponses accumulate across stories and
    // leak responses into unrelated test runs.
    for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
    const ghr = ctrl.githubResponses as Record<string, unknown>;
    for (const k of Object.keys(ghr)) delete ghr[k];

    // Default invoke responses — every command App's hooks call must have a defined response
    // or tauri-core falls through to the "no response" path which logs a warning.
    Object.assign(ctrl.invokeResponses, DEFAULT_INVOKES, options.invokeResponses ?? {});
    Object.assign(ctrl.githubResponses, options.githubResponses ?? {});

    // Restore baselines first, then layer overrides. Set/Map fields snapshotted
    // at module load are shared by reference across stories — reconstruct them
    // on every reset so a mutating story can't corrupt the baseline.
    useSettingsStore.setState({
      settings: deepMerge(SETTINGS_BASELINE, options.settings),
      isLoading: false,
      hasLoaded: true,
    });

    useUiStore.setState({
      ...UI_BASELINE,
      expandedRepoGroups: new Set<string>(),
      worktreeBranchMap: new Map(),
      activeSection: options.ui?.activeSection ?? 'focus',
    });

    useInitStore.setState({
      ...INIT_BASELINE,
      isComplete: options.init?.isComplete ?? true,
    });

    usePrStore.setState({
      ...PR_BASELINE,
      pullRequests: options.pullRequests ?? PRS_CANONICAL,
    });

    useOnboardingStore.setState({
      ...ONBOARDING_BASELINE,
      dismissedBadges: new Set(),
      dismissedHints: new Set(),
    });
    useWorkItemsStore.setState({
      ...WORKITEMS_BASELINE,
      trackedWorkItemIds: new Set<number>(),
      workingOnWorkItemIds: new Set<number>(),
      witTypeRefs: new Map<string, string>(),
      workItemTypeLayouts: new Map(),
      workItems: options.workItems ?? WORK_ITEMS_CANONICAL,
    });

    // QuickReview store leaks 'reviewing' state across stories without an
    // explicit reset — once FocusWithQuickReview seeds state='reviewing',
    // every subsequent story would render the QuickReview overlay on top
    // of unrelated content. Reconstruct `decisions` (Map) on every reset
    // so a mutating story can't corrupt the baseline by reference.
    useQuickReviewStore.setState({
      ...QUICK_REVIEW_BASELINE,
      decisions: new Map(),
    });

    return Story();
  };
}

// ── Common settings helpers ───────────────────────────────────

/**
 * Canonical "setup complete + one BorgDock repo" settings shape used by most
 * fully-loaded section stories. Returned as a fresh object per call (not
 * `as const`) so the inferred type stays mutable and assignable to
 * `DeepPartial<AppSettings>` — readonly tuples don't satisfy the mutable
 * `repos` array type.
 */
export function reposSettings(): DeepPartial<AppSettings> {
  return {
    setupComplete: true,
    repos: [
      {
        owner: 'borght-dev',
        name: 'BorgDock',
        enabled: true,
        worktreeBasePath: '',
        worktreeSubfolder: '',
      },
    ],
  };
}

// ── Wizard helpers ────────────────────────────────────────────

/**
 * Force the wizard to render by leaving setup incomplete. Pass an authMethod
 * to toggle between the AuthStep variants.
 *
 * Deviations from plan: RepoSettings requires enabled + worktreeBasePath +
 * worktreeSubfolder (all required by the RepoSettings interface), so the
 * repos array provides sensible defaults for those fields.
 *
 * `setupComplete` defaults to false (the !setupComplete gating branch in
 * App.tsx). Pass `setupComplete: true` together with `hasRepos: true` to
 * exercise the PAT-empty re-trigger branch instead — useful for stories
 * that need to land on the wizard via `authMethod === 'pat' && !personalAccessToken`
 * after a previously-completed setup.
 */
export function withWizard(
  options: {
    authMethod?: 'ghCli' | 'pat';
    hasToken?: boolean;
    hasRepos?: boolean;
    setupComplete?: boolean;
  } = {},
): Decorator {
  return withMainWindow({
    settings: {
      setupComplete: options.setupComplete ?? false,
      gitHub: {
        // Spread baseline first so real values take precedence over safe defaults.
        // Safe defaults cover required GitHubSettings fields when the baseline is
        // empty (e.g. in vitest/jsdom where the Tauri store is unavailable).
        ...(SETTINGS_BASELINE as AppSettings).gitHub,
        pollIntervalSeconds: (SETTINGS_BASELINE as AppSettings).gitHub?.pollIntervalSeconds ?? 60,
        username: (SETTINGS_BASELINE as AppSettings).gitHub?.username ?? '',
        authMethod: options.authMethod ?? 'ghCli',
        personalAccessToken: options.hasToken ? 'mock-token' : '',
      },
      repos: options.hasRepos
        ? [
            {
              owner: 'borght-dev',
              name: 'BorgDock',
              enabled: true,
              worktreeBasePath: '',
              worktreeSubfolder: '',
            },
          ]
        : [],
    } as DeepPartial<AppSettings>,
  });
}
