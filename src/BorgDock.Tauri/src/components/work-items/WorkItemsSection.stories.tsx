// src/components/work-items/WorkItemsSection.stories.tsx
//
// Work-items section stories — 4 stories exercising the main window work-items
// view: canonical, loading, failure (empty + fetch error simulation), and
// search active.
//
// Note on WorkItemsFailure: the work-items store has no top-level `error`
// field and WorkItemsSection does not render a dedicated error UI from store
// state. The failure story is rendered as empty items + a note; the section
// renders the empty-state branch, which is the closest visual approximation
// of a post-failure state today.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useWorkItemsStore } from '@/stores/work-items-store';
import App from '../../App';
import {
  MainWindowFrame,
  WORK_ITEMS_CANONICAL,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const frame: Decorator = (Story) => (
  <MainWindowFrame>
    <Story />
  </MainWindowFrame>
);

const meta: Meta<typeof App> = {
  title: 'Main Window/App/WorkItems',
  component: App,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

function reposSettings() {
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

// ── A. Canonical ───────────────────────────────────────────────

// Work-items section with WORK_ITEMS_CANONICAL pre-loaded.
export const WorkItemsCanonical: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'workitems' },
      workItems: WORK_ITEMS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};

// ── B. Loading ─────────────────────────────────────────────────

// Work-items section while a fetch is in progress — spinner / skeleton state.
export const WorkItemsLoading: Story = {
  decorators: [
    (Story) => {
      useWorkItemsStore.setState({ isLoading: true, workItems: [] });
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'workitems' },
      workItems: [],
      settings: reposSettings(),
    }),
  ],
};

// ── C. Failure (empty + no store-level error field) ────────────
//
// WorkItemsSection has no dedicated error UI driven by a store `error` field
// (the field doesn't exist). This story renders the empty-state branch as the
// closest approximation of a post-failure view. isLoading is false and
// workItems is empty to show the section's empty state.
export const WorkItemsFailure: Story = {
  decorators: [
    (Story) => {
      useWorkItemsStore.setState({ isLoading: false, workItems: [] });
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'workitems' },
      workItems: [],
      settings: reposSettings(),
    }),
  ],
};

// ── D. Searching ───────────────────────────────────────────────

// Work-items section with a search query active — filtered list rendered.
export const WorkItemsSearching: Story = {
  decorators: [
    (Story) => {
      useWorkItemsStore.setState({ searchQuery: 'storybook' });
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'workitems' },
      workItems: WORK_ITEMS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};
