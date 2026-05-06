// src/components/work-item-palette/__fixtures__/work-item-palette-data.ts
//
// Storybook-only fixtures for WorkItemPaletteApp. Production code never
// imports this file — verified by greping production paths in the plan's
// final verification step.

import type { AppSettings } from '@/types/settings';
import type { WorkItem } from '@/types/work-item';

// Production code only reads `settings.azureDevOps.*` and `settings.ui.theme`
// from the load_settings response in the work-item-palette flow, so we
// build a minimal shape and cast to AppSettings. Future extensions (e.g.
// reading more fields) would require this stub to be widened.
type SettingsStub = {
  ui?: { theme?: 'system' | 'light' | 'dark' };
  azureDevOps?: {
    organization?: string;
    project?: string;
    personalAccessToken?: string;
    authMethod?: 'azCli' | 'pat';
    authAutoDetected?: boolean;
    recentWorkItemIds?: number[];
    workingOnWorkItemIds?: number[];
  };
};

export function canonicalSettings(overrides?: SettingsStub): AppSettings {
  const base: SettingsStub = {
    ui: { theme: 'system' },
    azureDevOps: {
      organization: 'storybook-org',
      project: 'storybook-project',
      personalAccessToken: 'storybook-pat',
      authMethod: 'pat',
      authAutoDetected: true,
      recentWorkItemIds: [],
      workingOnWorkItemIds: [],
    },
  };
  return {
    ...base,
    ...(overrides ?? {}),
    ui: { ...base.ui, ...(overrides?.ui ?? {}) },
    azureDevOps: { ...base.azureDevOps, ...(overrides?.azureDevOps ?? {}) },
  } as unknown as AppSettings;
}

export function makePaletteWorkItem(overrides: Partial<WorkItem> & { id: number }): WorkItem {
  const base: WorkItem = {
    id: overrides.id,
    rev: 1,
    fields: {
      'System.Title': `Item #${overrides.id}`,
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
    url: `https://dev.azure.com/storybook-org/_apis/wit/workItems/${overrides.id}`,
    htmlUrl: `https://dev.azure.com/storybook-org/_workitems/edit/${overrides.id}`,
    relations: [],
  };
  return {
    ...base,
    ...overrides,
    fields: { ...base.fields, ...(overrides.fields ?? {}) },
  };
}

// --- Curated browse pool: spans multiple states / types / assignees.

export const browsePoolMixed: WorkItem[] = [
  makePaletteWorkItem({
    id: 101,
    fields: {
      'System.Title': 'Wire OAuth refresh token rotation',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 102,
    fields: {
      'System.Title': 'Investigate intermittent CI flake on macOS',
      'System.State': 'New',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 103,
    fields: {
      'System.Title': 'Document Storybook mock layer aliases',
      'System.State': 'Closed',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 200,
    fields: {
      'System.Title': 'Migrate work item palette to React 19 transitions',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Sam Engineer', uniqueName: 'sam@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 201,
    fields: {
      'System.Title': 'Auth-method auto-detect for ADO',
      'System.State': 'Resolved',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
];

export const assignedToMePool: WorkItem[] = [
  makePaletteWorkItem({
    id: 301,
    fields: {
      'System.Title': 'Auth-flow regression triage',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 302,
    fields: {
      'System.Title': 'Wire WorkItemPalette stories',
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 303,
    fields: {
      'System.Title': 'Sync ADO PAT scopes with org policy',
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'You', uniqueName: 'you@example.com' },
    },
  }),
];

export const recentIds: number[] = [103, 201, 200];
export const workingOnIds: number[] = [101, 200];

// --- Curated search pool: diverse IDs / titles / assignees.

export const searchPoolMixed: WorkItem[] = [
  makePaletteWorkItem({
    id: 12,
    fields: {
      'System.Title': 'Login form auth validation',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 120,
    fields: {
      'System.Title': 'Auth header refresh on 401',
      'System.State': 'Active',
      'System.WorkItemType': 'Bug',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 124,
    fields: {
      'System.Title': 'Improve auth-error toast copy',
      'System.State': 'New',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Sam Engineer', uniqueName: 'sam@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 50,
    fields: {
      'System.Title': 'Onboarding wizard polish',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AssignedTo': { displayName: 'Alex Reviewer', uniqueName: 'alex@example.com' },
    },
  }),
  makePaletteWorkItem({
    id: 51,
    fields: {
      'System.Title': 'Self-test diagnostics overhaul',
      'System.State': 'New',
      'System.WorkItemType': 'Task',
      'System.AssignedTo': { displayName: 'Pat Maintainer', uniqueName: 'pat@example.com' },
    },
  }),
];

// --- Scenario presets

import type { WorkItemPaletteScenario } from '../../../../.storybook/mocks/control';

export function emptyBrowseScenario(): WorkItemPaletteScenario {
  return {
    workItems: [],
    assignedToMe: [],
    searchPool: [],
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}

export function fullBrowseScenario(): WorkItemPaletteScenario {
  return {
    workItems: browsePoolMixed,
    assignedToMe: assignedToMePool,
    searchPool: searchPoolMixed,
    browseBehavior: 'normal',
    assignedToMeBehavior: 'normal',
    searchBehavior: 'normal',
  };
}

export function loadingBrowseScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    browseBehavior: 'pending',
    assignedToMeBehavior: 'pending',
  };
}

export function searchPendingScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    searchBehavior: 'pending',
  };
}

export function searchRejectScenario(): WorkItemPaletteScenario {
  return {
    ...fullBrowseScenario(),
    searchBehavior: 'reject',
  };
}
