// src/components/work-items/WorkItemDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { AdoClient } from '@/services/ado/client';
import type { WorkItem, WorkItemComment } from '@/types/work-item';
import { getControl, type WorkItemScenario } from '../../../.storybook/mocks/control';
import {
  canonicalSettings,
  userStoryFreshlyLoaded,
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
  ctrl.invokeResponses['load_settings'] = canonicalSettings();
  ctrl.invokeResponses['window_ready'] = undefined;
  ctrl.invokeResponses['ado_resolve_auth_header'] = 'Basic c3Rvcnlib29rOg==';

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
    AdoClient.prototype.getStream = async function () {
      return new Blob([bytes]);
    };
  }

  // Set the URL ?id=… so URLSearchParams picks it up.
  const desiredId =
    params.id === null
      ? null
      : (params.id ?? scenario.workItem?.id ?? userStoryFreshlyLoaded.id);
  const url =
    desiredId !== null
      ? `${window.location.pathname}?id=${desiredId}`
      : window.location.pathname;
  window.history.replaceState({}, '', url);
}

function restoreAfterMount(_params: WorkItemStoryParams) {
  // Restore prototype patches if any. Always safe to assign back —
  // we kept the original ref at module load.
  AdoClient.prototype.getStream = ORIGINAL_GET_STREAM;
}

function WorkItemDetailHarness({ params }: { params: WorkItemStoryParams }) {
  // Apply BEFORE the inner component mounts. Effects run after children mount
  // in React, so we call this synchronously in the function body.
  applyParamsBeforeMount(params);

  useEffect(() => {
    return () => restoreAfterMount(params);
    // The harness lives for the lifetime of the story — restore once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export const LoadedClean: Story = story({
  scenario: loadedScenario(userStoryFreshlyLoaded),
});
