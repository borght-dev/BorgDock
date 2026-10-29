// The work item card on an AB# reference (design/work-item-hover/mockups.html).
// The `InDescription` stories hover the reference in a real PR description.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { failingPr } from '@/components/pr/__fixtures__/checks-card-data';
import { PrDescription } from '@/components/shared/PrDescription';
import { useLinkStore } from '@/stores/link-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkItem } from '@/types';
import { type WorkItemCardLink, WorkItemCardView } from './WorkItemHoverCard';

const meta: Meta = {
  title: 'Work Items/Hover card',
  globals: { theme: 'dark' },
};
export default meta;
type Story = StoryObj;

const HOUR = 60 * 60 * 1000;

function workItem(id: number, fields: Record<string, unknown>): WorkItem {
  return {
    id,
    rev: 1,
    url: '',
    relations: [],
    htmlUrl: `https://dev.azure.com/gomocha/FSP/_workitems/edit/${id}`,
    fields: {
      'System.ChangedDate': new Date(Date.now() - 2 * HOUR).toISOString(),
      ...fields,
    },
  };
}

const BUG = workItem(61021, {
  'System.WorkItemType': 'Bug',
  'System.State': 'Code Review',
  'System.Title':
    'Planboard drag preview lands one resource lane too low when the board is scrolled',
  'System.AssignedTo': { displayName: 'Koen van der Borght' },
  'System.IterationPath': 'FSP\\Sprint 2026-22',
  'Microsoft.VSTS.Common.Priority': 2,
  'System.ChangedBy': { displayName: 'Vera' },
  'Microsoft.VSTS.TCM.ReproSteps':
    '<div><b>Repro:</b> open the planboard with more resources than fit, scroll down, drag an unplanned order onto the last visible lane. The ghost shows on the lane below and the order is planned there too. Started after the virtualised lanes change in 4.31.</div>',
});

const PBI = workItem(60877, {
  'System.WorkItemType': 'Product Backlog Item',
  'System.State': 'In Progress',
  'System.Title': 'Bulk reassign work orders from the list view',
  'System.AssignedTo': { displayName: 'Maaike Jansen' },
  'System.IterationPath': 'FSP\\Sprint 2026-22',
  'Microsoft.VSTS.Common.Priority': 1,
  'Microsoft.VSTS.Scheduling.Effort': 8,
  'System.ChangedDate': new Date(Date.now() - 26 * HOUR).toISOString(),
  'System.Description':
    '<p>As a planner I want to select multiple work orders and assign them to another engineer at once, so that covering for someone who is ill takes one action instead of fifty.</p>',
});

const BUG_LINKS: WorkItemCardLink[] = [
  { key: 'pr', lead: '#4812', label: 'checks passing', tone: 'ok' },
  { key: 't3', lead: 'T3', label: 'your turn', tone: 'run' },
];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24 }}>
      <div className="bd-hover-card" style={{ width: 400 }}>
        {children}
      </div>
    </div>
  );
}

export const Bug: Story = {
  render: () => (
    <Frame>
      <WorkItemCardView
        id={61021}
        peek={{ status: 'ready', item: BUG }}
        links={BUG_LINKS}
        canOpenWeb
      />
    </Frame>
  ),
};

export const ProductBacklogItemLight: Story = {
  globals: { theme: 'light' },
  render: () => (
    <Frame>
      <WorkItemCardView
        id={60877}
        peek={{ status: 'ready', item: PBI }}
        links={[{ key: 'pr', lead: '#4790', label: 'checks running', tone: 'run' }]}
        canOpenWeb
      />
    </Frame>
  ),
};

export const Loading: Story = {
  render: () => (
    <Frame>
      <WorkItemCardView id={61021} peek={{ status: 'loading' }} links={[]} canOpenWeb />
    </Frame>
  ),
};

export const NotConnected: Story = {
  render: () => (
    <Frame>
      <WorkItemCardView
        id={61021}
        peek={{ status: 'unconfigured' }}
        links={[]}
        canOpenWeb={false}
      />
    </Frame>
  ),
};

function seed(item: WorkItem) {
  useLinkStore.getState().setWorkItem(item.id, item);
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      azureDevOps: { ...s.settings.azureDevOps, organization: 'gomocha', project: 'FSP' },
    },
  }));
  const pr = failingPr();
  usePrStore.setState({
    pullRequests: [
      {
        ...pr,
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 18,
        skippedCount: 0,
        totalCheckCount: 18,
        pullRequest: { ...pr.pullRequest, body: `Fixes AB#${item.id}` },
      },
    ],
  });
}

const BUG_BODY = `## Summary

Dragging an order onto a resource near the bottom edge drew the preview one lane too low. The drop target now uses the lane's own bounds.

- Clamp preview to the hovered lane
- Add regression test for the last lane

Fixes AB#61021.`;

const PBI_BODY = `## What

Select several work orders in the list and reassign them to one engineer in a single step.

Implements AB#60877; notifications follow in AB#60912.

## Testing

- Reassign 1, 20 and 200 orders
- Orders already started stay with their engineer`;

async function hoverRef(canvasElement: HTMLElement, text: string) {
  await userEvent.hover(within(canvasElement).getByText(text));
  await waitFor(() => expect(document.querySelector('[data-work-item-card]')).toBeTruthy());
}

export const InDescription: Story = {
  render: () => {
    seed(BUG);
    return (
      <div style={{ width: 720, minHeight: 560, padding: 16 }}>
        <PrDescription body={BUG_BODY} />
      </div>
    );
  },
  play: async ({ canvasElement }) => hoverRef(canvasElement, 'AB#61021'),
};

export const InDescriptionLight: Story = {
  globals: { theme: 'light' },
  render: () => {
    seed(PBI);
    return (
      <div style={{ width: 720, minHeight: 520, padding: 16 }}>
        <PrDescription body={PBI_BODY} />
      </div>
    );
  },
  play: async ({ canvasElement }) => hoverRef(canvasElement, 'AB#60877'),
};
