// src/components/settings/__fixtures__/settings-data.tsx
//
// Shared canned data + a Storybook decorator for Settings stories.
// Centralizes the AppSettings shape so each story file can override
// just the slice it cares about.

import type { ReactNode } from 'react';
import type { Decorator } from '@storybook/react-vite';
import type { AppSettings } from '@/types/settings';
import type { SelfTestResult } from '@/components/settings/SelfTestResultsDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { PulseProvider } from '@/components/settings/useFieldPulse';
import { getControl } from '../../../../.storybook/mocks/control';

// Mirrors the defaultSettings literal in src/stores/settings-store.ts.
// Keep in lockstep — if defaults change, this fixture must too.
const defaultSettings: AppSettings = {
  setupComplete: false,
  gitHub: {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: '',
  },
  repos: [],
  ui: {
    theme: 'system',
    globalHotkey: 'Ctrl+Win+Shift+G',
    flyoutHotkey: 'Ctrl+Win+Shift+F',
    editorCommand: 'code',
    runAtStartup: false,
    quickReviewHotkey: '',
    startMinimizedToTray: false,
    restoreLastSelection: true,
  },
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { tray: true, system: true, sound: true, emailDigest: false },
  },
  claudeCode: {
    defaultPostFixAction: 'commitAndNotify',
  },
  claudeApi: {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    prSummaryEnabled: true,
    diffExplanationsEnabled: true,
    reviewNudgePhrasingEnabled: false,
    commitMessageSuggestionsEnabled: false,
  },
  claudeReview: {
    botUsername: 'claude[bot]',
  },
  updates: {
    autoCheckEnabled: true,
    autoDownload: true,
  },
  azureDevOps: {
    organization: '',
    project: '',
    authMethod: 'azCli',
    authAutoDetected: false,
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
  },
  sql: {
    connections: [],
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
  repoPriority: {},
};

/** Build a complete AppSettings, optionally overriding any top-level slice. */
export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...defaultSettings, ...overrides };
}

/** Empty first-launch state — all defaults, nothing configured. */
export const firstLaunchSettings: AppSettings = makeSettings();

/** Typical user — GitHub auth, 2 repos, 1 ADO connection, 1 SQL connection. */
export const configuredSettings: AppSettings = makeSettings({
  setupComplete: true,
  gitHub: {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: 'borght-dev',
  },
  repos: [
    {
      owner: 'borght-dev',
      name: 'BorgDock',
      enabled: true,
      worktreeBasePath: '/Users/koenvdb/projects',
      worktreeSubfolder: 'borgdock',
    },
    {
      owner: 'borght-dev',
      name: 'fsp-horizon',
      enabled: true,
      worktreeBasePath: '/Users/koenvdb/projects',
      worktreeSubfolder: 'fsp-horizon',
    },
  ],
  azureDevOps: {
    organization: 'gomocha',
    project: 'fsp',
    authMethod: 'azCli',
    authAutoDetected: true,
    pollIntervalSeconds: 120,
    favoriteQueryIds: ['my-active', 'recent-bugs'],
    trackedWorkItemIds: [12345, 12346],
    workingOnWorkItemIds: [12347],
    workItemWorktreePaths: {},
    recentWorkItemIds: [12345, 12346, 12347],
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
  },
  sql: {
    connections: [
      {
        name: 'fsp-prod (read-only)',
        server: 'fsp-prod.database.windows.net',
        port: 1433,
        database: 'fsp',
        authentication: 'sql',
        username: 'reader',
        trustServerCertificate: false,
      },
    ],
    lastUsedConnection: 'fsp-prod (read-only)',
    defaultConnectionName: 'fsp-prod (read-only)',
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
});

/** Decorator: seed the Zustand store + per-story invoke responses. */
export interface WithSettingsOptions {
  hasLoaded?: boolean;
  invokeResponses?: Record<string, unknown>;
}

export function withSettings(
  fixture: AppSettings,
  options: WithSettingsOptions = {},
): Decorator {
  return (Story) => {
    // The preview decorator already calls getControl().reset() before each
    // story; we run after that, so the seed is fresh on every render.
    const ctrl = getControl();
    Object.assign(ctrl.invokeResponses, options.invokeResponses ?? {});
    useSettingsStore.setState({
      settings: fixture,
      hasLoaded: options.hasLoaded ?? true,
    });
    return <Story />;
  };
}

/** Render frame for section-level stories: PulseProvider + max-width body. */
export function SectionFrame({ children }: { children: ReactNode }) {
  return (
    <PulseProvider value={{ pulseAnchor: null, setPulseAnchor: () => {} }}>
      <div className="bg-[var(--color-background)] text-[var(--color-text-primary)]">
        <div className="mx-auto max-w-[720px] px-9 pb-16 pt-7">{children}</div>
      </div>
    </PulseProvider>
  );
}

// ─── Synthetic data for dialog stories ───────────────────────────────────

export const repoCandidates = [
  { path: '/Users/koenvdb/projects/borgdock', owner: 'borght-dev', name: 'BorgDock', alreadyTracked: false },
  { path: '/Users/koenvdb/projects/fsp-horizon', owner: 'borght-dev', name: 'fsp-horizon', alreadyTracked: true },
  { path: '/Users/koenvdb/projects/pluim', owner: null, name: 'pluim', alreadyTracked: false },
  { path: '/Users/koenvdb/projects/devcenter', owner: 'borght-dev', name: 'devcenter', alreadyTracked: false },
];

export const selfTestResults: SelfTestResult[] = [
  { service: 'GitHub API', ok: true, message: 'Reachable; 4823/5000 rate-limit remaining' },
  { service: 'Azure DevOps', ok: true, message: 'az CLI v2.55.0; token valid' },
  { service: 'SQL Server', ok: true, message: 'fsp-prod responding (12 ms)' },
  { service: 'Claude Code', ok: true, message: 'claude --version → 2.0.5' },
];

export const selfTestMixed: SelfTestResult[] = [
  { service: 'GitHub API', ok: true, message: 'Reachable; 4823/5000 rate-limit remaining' },
  { service: 'Azure DevOps', ok: false, message: 'az CLI not logged in (run `az login`)' },
  { service: 'SQL Server', ok: true, message: 'fsp-prod responding (12 ms)' },
  { service: 'Claude Code', ok: false, message: 'claude binary not on PATH' },
];

export const otelStatus = {
  healthy: true,
  endpoint: 'http://127.0.0.1:4318',
  lastWriteAgoSeconds: 3,
};

export const otelStatusError = {
  healthy: false,
  endpoint: 'http://127.0.0.1:4318',
  lastWriteAgoSeconds: null,
};
