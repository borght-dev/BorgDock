// src/components/pr-detail/PRDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrDetailApp } from './PRDetailApp';
import {
  openPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';
import type { AppSettings } from '@/types';

const meta: Meta<typeof PrDetailApp> = {
  title: 'PR Detail/PRDetailApp',
  component: PrDetailApp,
};
export default meta;
type Story = StoryObj<typeof PrDetailApp>;

// Full AppSettings shape required — PRDetailApp writes the result of
// invoke('load_settings') directly into useSettingsStore and then reads
// settings.ui.theme and settings.gitHub.personalAccessToken. A partial
// object would cause downstream code to throw on undefined property access.
const LOAD_SETTINGS_RESPONSE: AppSettings = {
  setupComplete: true,
  gitHub: {
    authMethod: 'ghCli',
    personalAccessToken: 'gh_dummy',
    pollIntervalSeconds: 60,
    username: 'borght-dev',
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

const baseInvokes = {
  load_settings: LOAD_SETTINGS_RESPONSE,
  cache_init: undefined,
  window_ready: undefined,
  get_credential: null,
};

export const Default: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const LoadingNetwork: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: () => new Promise(() => {}),
      },
    }),
  ],
};

export const MissingParams: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      injectedPrParams: null,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const PrNotFound: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [],
      },
    }),
  ],
};

// '__throw__' is not supported by the tauri-core mock — use a rejecting
// function instead so the catch branch in PRDetailApp fires.
export const LoadSettingsRejects: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: {
        ...baseInvokes,
        load_settings: () => Promise.reject(new Error('settings load failed')),
      },
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};
