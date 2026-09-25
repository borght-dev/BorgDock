// src/components/work-items/WorkItemDetailView.stories.tsx
//
// The full-screen work item view of the main window (plans/ui-overhaul-workbench.md,
// phase 5): Back, `AB#id` with the type pill and state line, the title, the
// field pickers and the action bar, then Overview / Activity / Links /
// Attachments with the sliding underline beside the properties and
// discussion rail. The item is seeded into the work-items store, so it shows
// at once the way a row click opens it; the ADO service mock answers the
// refetch, states and comments.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequestWithChecks, WorkItem, WorkItemComment } from '@/types';
import { getControl } from '../../../.storybook/mocks/control';
import {
  bugWithReproSteps,
  canonicalSettings,
  commentsManyAuthors,
  makeWorkItem,
} from './__fixtures__/work-item-data';
import { WorkItemDetailView } from './WorkItemDetailView';

const STATES = ['New', 'Active', 'Committed', 'Resolved', 'Closed'];

const pbi: WorkItem = makeWorkItem({
  id: 54391,
  fields: {
    ...makeWorkItem().fields,
    'System.Id': 54391,
    'System.WorkItemType': 'Product Backlog Item',
    'System.Title': 'Customer-specific price lists on quotes',
    'System.State': 'Committed',
    'System.Description':
      '<p>Sales wants each customer to see their own price list on a quote. ' +
      'The list comes from the ERP sync and falls back to the default list.</p>',
    'Microsoft.VSTS.Common.AcceptanceCriteria':
      '<ol><li>A quote for a customer with a list uses that list.</li>' +
      '<li>Without one, the default list applies.</li></ol>',
    'Microsoft.VSTS.Common.Priority': 2,
  },
});

/** The same PBI with an Azure Repos PR link and two GitHub PRs that mention it. */
const pbiWithLinks: WorkItem = {
  ...pbi,
  relations: [
    {
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/PullRequestId/project%2Frepo%2F812',
      attributes: { name: 'Pull Request', comment: 'Price list API' },
    },
  ],
};

function mentioningPrs(now: number): PullRequestWithChecks[] {
  return [
    listPr(
      {
        number: 1204,
        title: 'Quotes use the customer price list (AB#54391)',
        repo: 'gomocha/fsp-horizon',
        author: 'mira',
        reviewStatus: 'approved',
        checks: { total: 24 },
      },
      now,
    ),
    listPr(
      {
        number: 1210,
        title: 'Price list sync from the ERP, AB#54391',
        repo: 'gomocha/fsp-horizon',
        checks: { total: 24, run: 3 },
      },
      now,
    ),
  ];
}

interface HarnessProps {
  item: WorkItem;
  comments?: WorkItemComment[];
  withPrs?: boolean;
  tracked?: boolean;
  working?: boolean;
  /** Not in the list: the view loads it behind a header with Back and the id. */
  unlisted?: boolean;
}

function Harness({
  item,
  comments = [],
  withPrs = false,
  tracked = false,
  working = false,
  unlisted = false,
}: HarnessProps) {
  // The scenario is read by the ADO service mock when the view mounts; the
  // preview decorator resets it before every story, so it is set here.
  const ctrl = getControl();
  ctrl.workItemScenario = {
    ...ctrl.workItemScenario,
    workItem: item,
    states: STATES,
    comments,
    loadBehavior: unlisted ? 'pending' : 'normal',
  };
  useState(() => {
    const settings = canonicalSettings();
    useSettingsStore.setState({
      settings: { ...settings, ui: { ...settings.ui } },
      isLoading: false,
    });
    useWorkItemsStore.setState({
      workItems: unlisted ? [] : [item],
      trackedWorkItemIds: new Set(tracked ? [item.id] : []),
      workingOnWorkItemIds: new Set(working ? [item.id] : []),
    });
    usePrStore.setState({
      pullRequests: withPrs ? mentioningPrs(Date.now()) : [],
      closedPullRequests: [],
    });
    useUiStore.setState({
      activeSection: 'workitems',
      viewStack: [{ kind: 'list' }, { kind: 'work-item-detail', id: item.id }],
    });
    return null;
  });
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <WorkItemDetailView id={item.id} />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Work Items/WorkItemDetailView',
  component: Harness,
};
export default meta;

type Story = StoryObj<typeof Harness>;

export const Bug: Story = {
  args: { item: bugWithReproSteps, comments: commentsManyAuthors, tracked: true, working: true },
};

export const ProductBacklogItem: Story = {
  args: { item: pbi },
};

export const WithLinkedPullRequests: Story = {
  args: { item: pbiWithLinks, withPrs: true, tracked: true },
};

export const Loading: Story = {
  args: { item: pbi, unlisted: true },
};
