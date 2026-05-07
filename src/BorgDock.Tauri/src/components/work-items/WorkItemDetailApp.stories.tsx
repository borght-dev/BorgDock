// src/components/work-items/WorkItemDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { userEvent, within } from 'storybook/test';
import { AdoClient } from '@/services/ado/client';
import type { WorkItem, WorkItemComment } from '@/types/work-item';
import { getControl, type WorkItemScenario } from '../../../.storybook/mocks/control';
import { screenshot } from '../../../.storybook/screenshot';
import {
  bugWithReproSteps,
  canonicalSettings,
  commentsManyAuthors,
  epicWithCustomFields,
  itemAssignedToOther,
  itemNeverModified,
  itemWithManyAttachments,
  taskMinimalFields,
  userStoryFreshlyLoaded,
  userStoryWithRichBody,
} from './__fixtures__/work-item-data';
import { WorkItemDetailApp } from './WorkItemDetailApp';

interface WorkItemStoryParams {
  /** Override the scenario state (workItem / states / comments / behaviors). */
  scenario?: Partial<WorkItemScenario>;
  /** id query-string param. Set to null to omit ?id=. Defaults to scenario.workItem?.id ?? 12345. */
  id?: number | null;
  /** Plugin-dialog responses. */
  dialogSaveResponse?: string | null;
  /** Stub for AdoClient.prototype.getStream — used by attachment download stories. */
  attachmentBytes?: Uint8Array;
}

const ORIGINAL_GET_STREAM = AdoClient.prototype.getStream;

function applyParamsBeforeMount(params: WorkItemStoryParams) {
  const ctrl = getControl();

  // Seed the canned load_settings response.
  ctrl.invokeResponses.load_settings = canonicalSettings();
  ctrl.invokeResponses.window_ready = undefined;
  ctrl.invokeResponses.ado_resolve_auth_header = 'Basic c3Rvcnlib29rOg==';

  // Seed the scenario.
  const scenario: WorkItemScenario = {
    ...ctrl.workItemScenario,
    ...(params.scenario ?? {}),
  };
  ctrl.workItemScenario = scenario;

  // Seed plugin-dialog responses if specified.
  if (params.dialogSaveResponse !== undefined) {
    ctrl.pluginDialog.saveResponse = params.dialogSaveResponse;
  }

  // Monkeypatch AdoClient.getStream for attachment-download stories.
  if (params.attachmentBytes) {
    const bytes = params.attachmentBytes;
    AdoClient.prototype.getStream = async () => {
      // Cast through unknown — Uint8Array<ArrayBufferLike> isn't assignable
      // to BlobPart's ArrayBufferView<ArrayBuffer> in lib.dom 5.6+.
      return new Blob([bytes as unknown as BlobPart]);
    };
  }

  // Set the URL ?id=… so URLSearchParams picks it up.
  const desiredId =
    params.id === null ? null : (params.id ?? scenario.workItem?.id ?? userStoryFreshlyLoaded.id);
  const url =
    desiredId !== null ? `${window.location.pathname}?id=${desiredId}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

function restoreAfterMount() {
  // Restore prototype patches if any. Always safe to assign back —
  // we kept the original ref at module load.
  AdoClient.prototype.getStream = ORIGINAL_GET_STREAM;
}

function WorkItemDetailHarness({ params }: { params: WorkItemStoryParams }) {
  // Apply BEFORE the inner component mounts. Effects run after children mount
  // in React, so we call this synchronously in the function body.
  applyParamsBeforeMount(params);

  useEffect(() => {
    return () => restoreAfterMount();
  }, []);

  return (
    <div style={{ width: 720, height: 720 }}>
      <WorkItemDetailApp />
    </div>
  );
}

const meta: Meta<typeof WorkItemDetailHarness> = {
  title: 'Work Items/WorkItemDetailApp',
  component: WorkItemDetailHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof WorkItemDetailHarness>;

function story(params: WorkItemStoryParams = {}): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_STATES = ['New', 'Active', 'Resolved', 'Closed', 'Removed'];

function loadedScenario(
  workItem: WorkItem,
  comments: WorkItemComment[] = [],
): Partial<WorkItemScenario> {
  return {
    workItem,
    states: DEFAULT_STATES,
    comments,
    loadBehavior: 'normal',
    statesBehavior: 'normal',
    commentsBehavior: 'normal',
  };
}

// ---------------------------------------------------------------------------
// Load-state axis
// ---------------------------------------------------------------------------

export const Loading: Story = story({
  scenario: { loadBehavior: 'pending' },
});

export const LoadError: Story = story({
  scenario: { loadBehavior: 'reject', loadError: 'Failed to load work item' },
});

export const NoIdProvided: Story = story({
  id: null,
});

export const LoadedClean: Story = {
  parameters: screenshot({
    output: 'site/public/screenshots/work-item-detail.png',
    width: 800,
    height: 900,
  }),
  args: {
    params: {
      scenario: loadedScenario(userStoryFreshlyLoaded),
    },
  },
};

// ---------------------------------------------------------------------------
// Item-shape axis
// ---------------------------------------------------------------------------

export const UserStoryWithRichBody: Story = story({
  scenario: loadedScenario(userStoryWithRichBody),
});

export const BugWithReproSteps: Story = story({
  scenario: loadedScenario(bugWithReproSteps),
});

export const TaskMinimalFields: Story = story({
  scenario: loadedScenario(taskMinimalFields),
});

export const EpicWithCustomFields: Story = story({
  scenario: loadedScenario(epicWithCustomFields),
});

export const ItemAssignedToOther: Story = story({
  scenario: loadedScenario(itemAssignedToOther),
});

export const ItemNeverModified: Story = story({
  scenario: loadedScenario(itemNeverModified),
});

// ---------------------------------------------------------------------------
// Comments axis
// ---------------------------------------------------------------------------

export const CommentsLoading: Story = story({
  scenario: {
    ...loadedScenario(userStoryFreshlyLoaded),
    commentsBehavior: 'pending',
  },
});

export const CommentsEmpty: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded, []),
});

export const CommentsManyAuthors: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded, commentsManyAuthors),
});

export const CommentsLoadFailed: Story = story({
  scenario: {
    ...loadedScenario(userStoryFreshlyLoaded),
    commentsBehavior: 'reject',
  },
});

// ---------------------------------------------------------------------------
// Save-flow axis
// ---------------------------------------------------------------------------

// TitleBlock renders the title as a click-to-edit `<h1>` (text node). It
// becomes an `<input>` only after the user clicks it. Saves are automatic via
// useAutoSave (500ms debounce after each change) — there is no Save button;
// committing the title input via blur or Enter triggers the save.
async function editTitle(canvasElement: HTMLElement, newTitle: string): Promise<void> {
  const canvas = within(canvasElement);
  const heading = await canvas.findByRole('heading', {
    name: /Implement the dashboard widget/i,
  });
  await userEvent.click(heading);
  const input = (await canvas.findByDisplayValue(
    /Implement the dashboard widget/i,
  )) as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, newTitle);
  // Enter commits the edit (TitleBlock blurs on Enter), which calls onChange
  // and kicks the autosave debounce.
  await userEvent.keyboard('{Enter}');
}

export const DirtyTitleEdited: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    await editTitle(canvasElement, 'Implement the dashboard widget (refined)');
  },
};

export const SavingInFlight: Story = {
  args: {
    params: {
      scenario: {
        ...loadedScenario(userStoryFreshlyLoaded),
        saveBehavior: 'pending',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await editTitle(canvasElement, 'Implement the dashboard widget (saving)');
    // saveBehavior: 'pending' means updateWorkItem never resolves;
    // useAutoSave will surface "Saving…" in the status bar.
    await canvas.findByText(/Saving/i);
  },
};

export const SavedSuccess: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await editTitle(canvasElement, 'Implement the dashboard widget (saved)');
    await canvas.findByText(/^Saved /i);
  },
};

export const SaveError: Story = {
  args: {
    params: {
      scenario: {
        ...loadedScenario(userStoryFreshlyLoaded),
        saveBehavior: 'reject',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await editTitle(canvasElement, 'Implement the dashboard widget (will fail)');
    await canvas.findByText(/Save failed/i);
  },
};

// ---------------------------------------------------------------------------
// Attachment axis
// ---------------------------------------------------------------------------

export const WithAttachments: Story = story({
  scenario: loadedScenario(itemWithManyAttachments),
});

// Default tab is "overview"; AttachmentsTab is rendered only when the
// "Attachments" tab is active. Activate it before searching for attachment rows.
async function openAttachmentsTab(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  const tab = await canvas.findByRole('tab', { name: /attachments/i });
  await userEvent.click(tab);
}

export const AttachmentSaveDialogCanceled: Story = {
  args: {
    params: {
      scenario: loadedScenario(itemWithManyAttachments),
      dialogSaveResponse: null,
      attachmentBytes: new Uint8Array([0x42, 0x44, 0x4f, 0x43, 0x4b]),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openAttachmentsTab(canvasElement);
    const button = await canvas.findByRole('button', { name: /attachment-1\.png/i });
    await userEvent.click(button);
    // dialogSaveResponse: null → user cancelled the save dialog.
    // Production code returns early without writing.
  },
};

export const AttachmentDownloaded: Story = {
  args: {
    params: {
      scenario: loadedScenario(itemWithManyAttachments),
      dialogSaveResponse: '/tmp/attachment-1.png',
      attachmentBytes: new Uint8Array([0x42, 0x44, 0x4f, 0x43, 0x4b]),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openAttachmentsTab(canvasElement);
    const button = await canvas.findByRole('button', { name: /attachment-1\.png/i });
    await userEvent.click(button);
    // The bytes from attachmentBytes are written to /tmp/attachment-1.png
    // in the in-memory pluginFs.writes map.
  },
};

// ---------------------------------------------------------------------------
// Window-chrome / interaction axis
// ---------------------------------------------------------------------------

export const DeleteAction: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const deleteButton = await canvas.findByRole('button', { name: /^delete$/i });
    await userEvent.click(deleteButton);
    // The mocked workitems.deleteWorkItem succeeds; window.close is a
    // no-op; the iframe survives.
  },
};

export const OpenInBrowserClicked: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The "open in ADO" button is a small icon button (children: "↗"),
    // labelled via the title attribute "Open in ADO".
    const button = await canvas.findByTitle(/open in ado/i);
    await userEvent.click(button);
  },
};

export const CloseButtonClicked: Story = {
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The header has a Close icon button (aria-label: "Close"). Match by
    // tooltip / accessible-name "Close".
    const closeButton = await canvas.findByRole('button', { name: /^close$/i });
    await userEvent.click(closeButton);
  },
};

export const TitleSetOnLoad: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded),
});

// ---------------------------------------------------------------------------
// v2 variants
// ---------------------------------------------------------------------------

export const V2Overview: Story = story({
  scenario: loadedScenario(bugWithReproSteps, commentsManyAuthors),
});
V2Overview.storyName = 'v2 — overview';

// NOTE: WorkItemDetailHarness hard-codes its container to 720×720, so the
// outer decorator width has no effect and the ResizeObserver never crosses the
// 760px (RAIL_COLLAPSE_BREAKPOINT_PX) threshold. Demonstrating the collapsed
// rail state requires a harness that accepts a width prop. Renamed from
// V2NarrowRailCollapsed to avoid a misleading story name.
export const V2DefaultLayout: Story = {
  name: 'v2 — default layout',
  args: {
    params: { scenario: loadedScenario(userStoryFreshlyLoaded) },
  },
};
