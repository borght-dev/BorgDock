// src/components/work-item-palette/WorkItemPaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, userEvent, waitFor, within } from 'storybook/test';
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
  searchRejectScenario,
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

// --- Search-content axis (3)

export const SearchByIdPrefix: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, '12');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // searchPoolMixed has ids 12, 120, 124 starting with "12"
          if (!text.includes('3 results')) {
            throw new Error(`expected 3 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchByTextTitle: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'auth');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // 3 items in searchPoolMixed have "auth" in their title
          if (!text.includes('3 results')) {
            throw new Error(`expected 3 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const SearchByTextAssignee: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'alex');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          // 2 items in searchPoolMixed are assigned to "Alex Reviewer"
          if (!text.includes('2 results')) {
            throw new Error(`expected 2 results, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

// --- Search-failure axis (2)

export const SearchFailed: Story = story(
  { scenario: searchRejectScenario() },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'work');
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!text.includes('Search failed')) {
            throw new Error(`expected Search failed, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const AdoNotConfigured: Story = story(
  {
    scenario: fullBrowseScenario(),
    organization: '', // empty org — production AdoClient still constructs
  },
  {
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const input = await canvas.findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await userEvent.type(input, 'work');
      // With an empty organization the AdoClient still constructs (no
      // null-guard), so the search proceeds normally and returns the
      // mocked scenario results. Best the story can assert is that some
      // post-debounce status appears (No results / N results / Searching).
      await waitFor(
        () => {
          const text = canvasElement.textContent ?? '';
          if (!/result|Search/.test(text)) {
            throw new Error(`expected post-debounce status, saw: ${text.slice(0, 200)}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

// --- Interaction axis (4)

export const HoverHighlightsRow: Story = story(
  {
    scenario: fullBrowseScenario(),
    workingOnWorkItemIds: [101, 200],
    recentWorkItemIds: [103, 201, 200],
  },
  {
    play: async ({ canvasElement }) => {
      const rows = await waitFor(
        () => {
          const found = canvasElement.querySelectorAll('[data-palette-row]');
          if (found.length < 2) throw new Error('expected ≥2 rows');
          return found;
        },
        { timeout: 2000 },
      );
      await userEvent.hover(rows[1] as Element);
      await waitFor(() => {
        const cls = (rows[1] as HTMLElement).className;
        if (!cls.includes('accent-subtle')) {
          throw new Error('hover did not promote selection class');
        }
      });
    },
  },
);

export const EnterOpensDetailWindow: Story = story(
  {
    scenario: fullBrowseScenario(),
    workingOnWorkItemIds: [101],
    recentWorkItemIds: [],
  },
  {
    play: async ({ canvasElement }) => {
      const input = (await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      )) as HTMLInputElement;
      // Wait for browse data to land + initial selection.
      await waitFor(
        () => {
          if (canvasElement.querySelectorAll('[data-palette-row]').length === 0)
            throw new Error('rows not yet rendered');
        },
        { timeout: 2000 },
      );
      input.focus();
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await waitFor(
        () => {
          const created = getControl().webviewWindowsCreated;
          if (created.length === 0) throw new Error('no detail window opened');
          if (!created.some((w) => w.label.startsWith('workitem-detail-'))) {
            throw new Error(`unexpected label: ${created[0]?.label}`);
          }
        },
        { timeout: 2000 },
      );
    },
  },
);

export const EscapeHidesPalette: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      // Wait for input to mount so the global keydown listener is wired.
      await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(
        () => {
          const found = getControl().invocations.some((i) => i.command === 'window.hide');
          if (!found) throw new Error('window.hide not invoked');
        },
        { timeout: 2000 },
      );
    },
  },
);

export const DragRegionPresent: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      // After the WindowTitleBar refactor (master at e864f267), the
      // 3-dot grip + onMouseDown -> startDragging() pattern was replaced
      // by an OS-level data-tauri-drag-region attribute on the title bar.
      // The story now asserts the attribute is rendered (so the OS knows
      // the user can drag the window from the title bar) — matching the
      // production-test assertion pattern in
      // __tests__/WorkItemPaletteApp.test.tsx.
      const region = canvasElement.querySelector('[data-tauri-drag-region]');
      if (!region) throw new Error('data-tauri-drag-region not found');
    },
  },
);

// --- Lifecycle axis (2)

export const WindowReadyOnMount: Story = story(
  { scenario: emptyBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      );
      await waitFor(
        () => {
          const found = getControl().invocations.some((i) => i.command === 'window_ready');
          if (!found) throw new Error('window_ready was not invoked on mount');
        },
        { timeout: 2000 },
      );
    },
  },
);

export const PaletteShownEventResetsState: Story = story(
  { scenario: fullBrowseScenario() },
  {
    play: async ({ canvasElement }) => {
      const input = (await within(canvasElement).findByPlaceholderText(
        'Search by ID, title, or assigned to...',
      )) as HTMLInputElement;
      await userEvent.type(input, 'abc');
      await waitFor(() => {
        if (input.value !== 'abc') throw new Error('input did not accept text');
      });
      // Emit palette-shown to trigger the production reset effect.
      getControl().emit('palette-shown', undefined);
      await waitFor(
        () => {
          if (input.value !== '') throw new Error('input was not cleared');
        },
        { timeout: 2000 },
      );
    },
  },
);
