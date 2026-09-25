// src/components/work-items/WorkbenchWorkItems.stories.tsx
//
// Work items (plans/ui-overhaul-workbench.md, phase 5): the row matrix (types, tracked, working, selected, compact) and
// the section with its head row, query picker and state groups. Rows open the
// full-screen detail view in the app; here a click only selects.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AdoQuery, PrDensity, WorkItem } from '@/types';
import { WorkItemRow, type WorkItemRowData } from './WorkItemRow';
import { WorkItemsSection } from './WorkItemsSection';

// ---- Fixtures ----

const ROWS: WorkItemRowData[] = [
  {
    id: 54482,
    type: 'Bug',
    title: 'Quote footer overlaps the totals on A4 prints',
    state: 'Active',
    priority: 1,
    isTracked: true,
    isWorking: true,
  },
  {
    id: 54470,
    type: 'Task',
    title: 'Wire the price list export to the new endpoint',
    state: 'New',
    priority: 2,
    isTracked: false,
    isWorking: false,
  },
  {
    id: 54391,
    type: 'Product Backlog Item',
    title: 'Customer-specific price lists on quotes',
    state: 'Committed',
    priority: 2,
    isTracked: true,
    isWorking: false,
  },
  {
    id: 54210,
    type: 'User Story',
    title: 'Planner sees travel time between two visits',
    state: 'Resolved',
    isTracked: false,
    isWorking: false,
  },
  {
    id: 53998,
    type: 'Feature',
    title: 'Offline mode for the mobile client',
    state: 'Testing Failed',
    priority: 3,
    isTracked: false,
    isWorking: true,
  },
];

function toWorkItem(row: WorkItemRowData): WorkItem {
  return {
    id: row.id,
    rev: 1,
    url: '',
    fields: {
      'System.Title': row.title,
      'System.State': row.state,
      'System.WorkItemType': row.type,
      'System.AssignedTo': { displayName: 'Koen van der Borght' },
      ...(row.priority ? { 'Microsoft.VSTS.Common.Priority': row.priority } : {}),
    },
    relations: [],
    htmlUrl: '',
  };
}

const MORE: WorkItemRowData[] = [
  { ...ROWS[1]!, id: 54501, title: 'Translate the new settings page', state: 'New' },
  {
    ...ROWS[0]!,
    id: 54512,
    title: 'Signature pad clears on rotate',
    isTracked: false,
    isWorking: false,
  },
  {
    ...ROWS[2]!,
    id: 54530,
    title: 'Bulk-assign visits from the map',
    state: 'Active',
    isTracked: false,
  },
];

function query(id: string, name: string): AdoQuery {
  return {
    id,
    name,
    path: `Shared Queries/${name}`,
    isFolder: false,
    hasChildren: false,
    children: [],
  };
}

const FEW_QUERIES = [
  query('q-mine', 'Assigned to me'),
  query('q-sprint', 'Current sprint'),
  query('q-bugs', 'Open bugs'),
];
const MANY_QUERIES = Array.from({ length: 18 }, (_, i) => query(`q-${i}`, `Team query ${i + 1}`));

// ---- Row matrix ----

function RowMatrix({ density }: { density: PrDensity }) {
  const [selected, setSelected] = useState<number | null>(54470);
  return (
    <div
      className="bd-wb-list"
      data-density={density}
      style={{ fontFamily: 'var(--font-ui)', fontSize: 13, background: 'var(--color-background)' }}
    >
      {ROWS.map((row) => (
        <WorkItemRow
          key={row.id}
          item={row}
          density={density}
          selected={selected === row.id}
          onOpen={setSelected}
          onToggleTracked={() => {}}
          onToggleWorking={() => {}}
        />
      ))}
    </div>
  );
}

// ---- Section ----

interface SectionProps {
  queries?: AdoQuery[];
  favorites?: string[];
  density?: PrDensity;
  empty?: boolean;
}

function Section({
  queries = FEW_QUERIES,
  favorites = ['q-mine', 'q-sprint', 'q-bugs'],
  density = 'comfortable',
  empty = false,
}: SectionProps) {
  useState(() => {
    const rows = empty ? [] : [...ROWS, ...MORE];
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        ui: { ...s.settings.ui, prDensity: density },
        azureDevOps: {
          ...s.settings.azureDevOps,
          organization: 'storybook-org',
          project: 'storybook-project',
          authMethod: 'pat',
          personalAccessToken: 'storybook-pat',
          favoriteQueryIds: favorites,
        },
      },
    }));
    useWorkItemsStore.setState({
      queryTree: queries,
      favoriteQueryIds: favorites,
      selectedQueryId: queries[0]?.id ?? null,
      workItems: rows.map(toWorkItem),
      stateFilter: 'all',
      assignedToFilter: '',
      searchQuery: '',
      trackingFilter: 'all',
      trackedWorkItemIds: new Set(rows.filter((r) => r.isTracked).map((r) => r.id)),
      workingOnWorkItemIds: new Set(rows.filter((r) => r.isWorking).map((r) => r.id)),
      isLoading: false,
    });
    useUiStore.setState({
      activeSection: 'workitems',
      viewStack: [{ kind: 'list' }],
      workItemsSelectedId: 54391,
    });
    return null;
  });
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <WorkItemsSection />
    </div>
  );
}

const meta: Meta = {
  title: 'Work Items/Workbench',
};
export default meta;

export const RowsComfortable: StoryObj<typeof RowMatrix> = {
  render: () => <RowMatrix density="comfortable" />,
};

export const RowsCompact: StoryObj<typeof RowMatrix> = {
  render: () => <RowMatrix density="compact" />,
};

export const SectionFewQueries: StoryObj<typeof Section> = {
  render: () => <Section />,
};

export const SectionShortQueryList: StoryObj<typeof Section> = {
  render: () => <Section favorites={[]} queries={FEW_QUERIES} />,
};

export const SectionManyQueries: StoryObj<typeof Section> = {
  render: () => (
    <Section favorites={['q-0', 'q-1', 'q-2', 'q-3', 'q-4', 'q-5']} queries={MANY_QUERIES} />
  ),
};

export const SectionCompact: StoryObj<typeof Section> = {
  render: () => <Section density="compact" />,
};

export const SectionEmptyQuery: StoryObj<typeof Section> = {
  render: () => <Section empty />,
};
