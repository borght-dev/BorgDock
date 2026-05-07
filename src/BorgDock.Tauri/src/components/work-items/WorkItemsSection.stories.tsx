// src/components/work-items/WorkItemsSection.stories.tsx
//
// Work-items section stories — 4 stories exercising the main window
// work-items view: canonical, loading, no-query (cold-start empty state),
// and search active.
//
// Note: the work-items store has no top-level `error` field and
// WorkItemsSection does not render a dedicated failure UI from store state.
// The "WorkItemsFailure" cell from the spec is therefore unfilled; the
// closest visual we can drive today is the cold-start empty state, captured
// as WorkItemsNoQuery below.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useWorkItemsStore } from '@/stores/work-items-store';
import App from '../../App';
import {
  MainWindowFrame,
  reposSettings,
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

// ── C. No query selected (cold-start empty state) ──────────────
//
// Renders the section's "pick a query from the rail" empty state.
// `isLoading: false, workItems: []` matches both a cold start (no query
// selected yet) and a post-failure state — the section has no error UI
// distinguishing the two, so we name this story by what it actually
// renders rather than by the spec's "failure" cell.
export const WorkItemsNoQuery: Story = {
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
