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
  searchPendingScenario,
  searchPoolMixed,
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

// --- Section-shape axis (4)

export const OnlyWorkingOn: Story = story({
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [101], // matches browsePoolMixed[0]
  recentWorkItemIds: [],
});

export const OnlyAssignedToMe: Story = story({
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [],
  recentWorkItemIds: [],
});

export const OnlyRecent: Story = story({
  scenario: {
    ...fullBrowseScenario(),
    assignedToMe: [], // suppress assigned-to-me so only Recent renders
  },
  workingOnWorkItemIds: [],
  recentWorkItemIds: [103, 201, 200],
});

export const DedupAcrossSections: Story = story({
  // 200 is in both workingOn AND recentIds; it should only appear under Working On
  scenario: fullBrowseScenario(),
  workingOnWorkItemIds: [101, 200],
  recentWorkItemIds: [103, 201, 200],
});

// --- Search-state axis (5)

export const SearchTypeTooShortText: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const { within, userEvent, waitFor } = await import('storybook/test');
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'a');
      await waitFor(() => {
        const text = canvasElement.textContent ?? '';
        if (!text.includes('Type at least 2 characters')) {
          throw new Error('expected too-short-text status');
        }
      });
    },
  },
);

export const SearchTypeTooShortNumeric: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const { within, userEvent, waitFor } = await import('storybook/test');
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, '5');
      await waitFor(() => {
        const text = canvasElement.textContent ?? '';
        if (!text.includes('Type at least 2 digits')) {
          throw new Error('expected too-short-numeric status');
        }
      });
    },
  },
);

export const SearchInFlight: Story = story(
  { scenario: searchPendingScenario() },
  {
    play: async ({ canvasElement }) => {
      const { within, userEvent, waitFor } = await import('storybook/test');
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'auth');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('Searching')) {
            throw new Error('expected Searching status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchNoResults: Story = story(
  {
    scenario: {
      ...fullBrowseScenario(),
      searchPool: [], // empty pool → no matches for any query
    },
  },
  {
    play: async ({ canvasElement }) => {
      const { within, userEvent, waitFor } = await import('storybook/test');
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'missing');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('No results')) {
            throw new Error('expected No results status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchOneResult: Story = story(
  {
    scenario: {
      ...fullBrowseScenario(),
      searchPool: [searchPoolMixed[0]!], // exactly one match for 'login'
    },
  },
  {
    play: async ({ canvasElement }) => {
      const { within, userEvent, waitFor } = await import('storybook/test');
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'login');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('1 result')) {
            throw new Error('expected 1 result status');
          }
        },
        { timeout: 2000 },
      );
    },
  },
);
