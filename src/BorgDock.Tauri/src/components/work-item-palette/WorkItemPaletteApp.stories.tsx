// src/components/work-item-palette/WorkItemPaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { WorkItemPaletteApp } from './WorkItemPaletteApp';
import { getControl, type WorkItemPaletteScenario } from '../../../.storybook/mocks/control';
import {
  canonicalSettings,
  emptyBrowseScenario,
  fullBrowseScenario,
  loadingBrowseScenario,
  recentIds,
  workingOnIds,
} from './__fixtures__/work-item-palette-data';

interface PaletteParams {
  scenario: WorkItemPaletteScenario;
  recentWorkItemIds?: number[];
  workingOnWorkItemIds?: number[];
  organization?: string;
  theme?: 'light' | 'dark' | 'system';
}

function WorkItemPaletteHarness({ params }: { params: PaletteParams }) {
  // Apply scenario / settings BEFORE first render so the hook's mount
  // effect sees the canned load_settings response.
  useMemo(() => {
    const ctrl = getControl();
    ctrl.reset();
    localStorage.removeItem('borgdock-palette-position');
    ctrl.workItemPaletteScenario = params.scenario;
    ctrl.invokeResponses.load_settings = canonicalSettings({
      ui: { theme: params.theme ?? 'system' },
      azureDevOps: {
        organization: params.organization ?? 'storybook-org',
        recentWorkItemIds: params.recentWorkItemIds ?? [],
        workingOnWorkItemIds: params.workingOnWorkItemIds ?? [],
      },
    });
    ctrl.invokeResponses.save_settings = undefined;
    ctrl.invokeResponses.window_ready = undefined;
  }, [params]);

  return (
    <div style={{ width: 480, height: 600, position: 'relative' }}>
      <WorkItemPaletteApp />
    </div>
  );
}

const meta: Meta<typeof WorkItemPaletteHarness> = {
  title: 'Windows/WorkItemPaletteApp',
  component: WorkItemPaletteHarness,
};

export default meta;
type Story = StoryObj<typeof WorkItemPaletteHarness>;

function story(params: PaletteParams, extra?: Partial<Story>): Story {
  return {
    args: { params },
    ...extra,
  };
}

// --- Browse-state axis (4)

export const EmptyBrowse: Story = story({
  scenario: emptyBrowseScenario(),
});

export const LoadingBrowse: Story = story({
  scenario: loadingBrowseScenario(),
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: workingOnIds,
});

export const BrowseFullSections: Story = story({
  scenario: fullBrowseScenario(),
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: workingOnIds,
});

export const BrowsePartialSections: Story = story({
  scenario: fullBrowseScenario(),
  recentWorkItemIds: recentIds,
  workingOnWorkItemIds: [], // no Working On section
});
