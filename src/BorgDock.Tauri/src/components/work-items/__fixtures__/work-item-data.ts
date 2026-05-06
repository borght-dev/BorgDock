// src/components/work-items/__fixtures__/work-item-data.ts
//
// Synthetic WorkItem / Comment fixtures + a complete-AppSettings
// factory for Storybook. Real ADO data never enters Storybook —
// these fixtures are the only inputs.

import type { AppSettings } from '@/types/settings';
import type { WorkItem, WorkItemComment } from '@/types/work-item';

const STORYBOOK_ORG = 'storybook-org';
const STORYBOOK_PROJECT = 'storybook-project';

export function canonicalSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: 'storybook' },
    repos: [],
    ui: {
      theme: 'system',
      globalHotkey: '',
      flyoutHotkey: '',
      editorCommand: 'code',
      runAtStartup: false,
      quickReviewHotkey: '',
      startMinimizedToTray: false,
      restoreLastSelection: true,
    },
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: false,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 60,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: false, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-7',
      maxTokens: 4096,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: STORYBOOK_ORG,
      project: STORYBOOK_PROJECT,
      authMethod: 'pat',
      authAutoDetected: false,
      personalAccessToken: 'storybook-pat',
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'both',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: true,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
    ...overrides,
  };
}

export function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 12345,
    rev: 7,
    url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/workItems/12345`,
    htmlUrl: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_workitems/edit/12345`,
    fields: {
      'System.Id': 12345,
      'System.WorkItemType': 'User Story',
      'System.Title': 'Implement the dashboard widget',
      'System.State': 'Active',
      'System.AssignedTo': { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
      'System.AreaPath': 'Storybook\\Dashboard',
      'System.IterationPath': 'Storybook\\Sprint 42',
      'System.CreatedDate': '2026-04-15T09:30:00Z',
      'System.ChangedDate': '2026-05-01T11:15:00Z',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.Tags': 'frontend; dashboard',
    },
    relations: [],
    ...overrides,
  };
}

export function makeComment(overrides: Partial<WorkItemComment> = {}): WorkItemComment {
  return {
    id: 1,
    text: 'A baseline comment on the work item.',
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    createdDate: '2026-04-30T12:00:00Z',
    modifiedDate: '2026-04-30T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Curated work items
// ---------------------------------------------------------------------------

export const userStoryFreshlyLoaded: WorkItem = makeWorkItem();

export const userStoryWithRichBody: WorkItem = makeWorkItem({
  id: 12346,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12346,
    'System.Title': 'Refactor the dashboard layout engine',
    'System.Description':
      '<h3>Goal</h3><p>Move the dashboard layout to a CSS-grid based engine. ' +
      'This unblocks responsive widgets and removes the legacy flexbox hacks.</p>' +
      '<ul><li>Audit current widget sizes</li><li>Define grid templates</li>' +
      '<li>Migrate three widgets as a pilot</li></ul>',
    'Microsoft.VSTS.Common.AcceptanceCriteria':
      '<ol><li>All three pilot widgets render in the new grid.</li>' +
      '<li>Storybook smoke tests pass for the dashboard route.</li>' +
      '<li>No visual regression on the desktop viewport.</li></ol>',
  },
});

export const bugWithReproSteps: WorkItem = makeWorkItem({
  id: 12347,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12347,
    'System.WorkItemType': 'Bug',
    'System.Title': 'Save button stays disabled after editing tags',
    'System.State': 'Active',
    'Microsoft.VSTS.TCM.ReproSteps':
      '<ol><li>Open a work item.</li><li>Edit the Tags field.</li>' +
      '<li>Tab out of the input.</li><li>Observe the Save button is still disabled.</li></ol>' +
      '<p><strong>Expected:</strong> Save enables when any field changes.</p>',
    'Microsoft.VSTS.Common.Priority': 1,
  },
});

export const taskMinimalFields: WorkItem = {
  id: 12348,
  rev: 1,
  url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/workItems/12348`,
  htmlUrl: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_workitems/edit/12348`,
  fields: {
    'System.Id': 12348,
    'System.WorkItemType': 'Task',
    'System.Title': 'Wire up storybook smoke test',
    'System.State': 'New',
    'System.AssignedTo': '',
    'System.Tags': '',
  },
  relations: [],
};

export const epicWithCustomFields: WorkItem = makeWorkItem({
  id: 12349,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12349,
    'System.WorkItemType': 'Epic',
    'System.Title': 'Q2 dashboard overhaul',
    'System.State': 'Active',
    'Custom.BusinessValue': 'High — unblocks three downstream features.',
    'Custom.RoughTShirtSize': 'L',
    'Microsoft.VSTS.CMMI.RiskLevel': 'Medium',
    'Microsoft.VSTS.CMMI.MitigationPlan': 'Deliver pilot in two slices, gate on smoke tests.',
  },
});

export const itemWithManyAttachments: WorkItem = makeWorkItem({
  id: 12350,
  relations: Array.from({ length: 5 }, (_, i) => ({
    rel: 'AttachedFile',
    url: `https://dev.azure.com/${STORYBOOK_ORG}/${STORYBOOK_PROJECT}/_apis/wit/attachments/att-${i + 1}`,
    attributes: {
      id: `att-${i + 1}`,
      name: `attachment-${i + 1}.${['png', 'jpg', 'pdf', 'log', 'txt'][i]}`,
      resourceSize: (i + 1) * 1024 * 12,
    },
  })),
});

export const itemWithLongTitle: WorkItem = makeWorkItem({
  id: 12351,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12351,
    'System.Title':
      'A deliberately long work-item title that wraps onto multiple lines so the title bar layout, ' +
      'the textarea, and the save flow all have to handle real-world copy that exceeds a single line',
  },
});

export const itemAssignedToOther: WorkItem = makeWorkItem({
  id: 12352,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 12352,
    'System.AssignedTo': { displayName: 'Sam Otherperson', uniqueName: 'sam@example.com' },
  },
});

export const itemNeverModified: WorkItem = makeWorkItem({
  id: 12353,
  fields: {
    'System.Id': 12353,
    'System.WorkItemType': 'User Story',
    'System.Title': 'Brand-new item awaiting triage',
    'System.State': 'New',
    'System.AssignedTo': '',
    'System.Tags': '',
  },
});

// ---------------------------------------------------------------------------
// Curated comment lists
// ---------------------------------------------------------------------------

export const commentsManyAuthors: WorkItemComment[] = [
  makeComment({
    id: 1,
    createdBy: { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
    text: '<p>Started looking at this — the layout audit is in <code>docs/audit.md</code>.</p>',
    createdDate: '2026-04-25T08:30:00Z',
  }),
  makeComment({
    id: 2,
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    text: '<p>Could you split the audit into a separate ticket?</p>',
    createdDate: '2026-04-26T10:00:00Z',
  }),
  makeComment({
    id: 3,
    createdBy: { displayName: 'Jordan Programmer', uniqueName: 'jordan@example.com' },
    text: '<p>+1 to splitting. I can pick up the audit if needed.</p>',
    createdDate: '2026-04-27T13:45:00Z',
  }),
  makeComment({
    id: 4,
    createdBy: { displayName: 'Alex Storyteller', uniqueName: 'alex@example.com' },
    text: '<p>Done — see <a href="https://example.com/audit">audit ticket</a>.</p>',
    createdDate: '2026-04-28T09:10:00Z',
  }),
  makeComment({
    id: 5,
    createdBy: { displayName: 'Sam Otherperson', uniqueName: 'sam@example.com' },
    text: '<p>Thanks all. Closing the audit thread here.</p>',
    createdDate: '2026-04-29T16:30:00Z',
  }),
  makeComment({
    id: 6,
    createdBy: { displayName: 'Pat Reviewer', uniqueName: 'pat@example.com' },
    text: '<p>Ready for review.</p>',
    createdDate: '2026-05-01T11:00:00Z',
  }),
];
