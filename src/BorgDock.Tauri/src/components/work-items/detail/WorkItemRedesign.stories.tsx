// The work item redesign (design/work-item-detail/mockups.html): the full view
// (frame A), the peek from a pull request (frame D) and the hover cards
// (frame E), on the mockup's sample — AB#4127, a Bug filed from an email, with
// its process layout, pull request and agent thread.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { WorkItemPreview } from '@/components/pr-detail/WorkItemPreview';
import type { LatestMessage } from '@/services/dispatch/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import { getControl } from '../../../../.storybook/mocks/control';
import { activityComments, activityUpdates } from '../__fixtures__/activity-data';
import {
  REDESIGN_BUG_LAYOUT,
  REDESIGN_FIELD_DEFS,
  REDESIGN_TYPES,
  redesignBug,
  redesignOverview,
  redesignRelated,
} from '../__fixtures__/redesign-data';
import { canonicalSettings } from '../__fixtures__/work-item-data';
import { WorkItemDetailView } from '../WorkItemDetailView';
import { WorkItemCardView } from '../WorkItemHoverCard';

const HOUR = 60 * 60 * 1000;

function seed(now: number, bug: WorkItem) {
  const ctrl = getControl();
  ctrl.workItemScenario = {
    ...ctrl.workItemScenario,
    workItem: bug,
    states: ['New', 'Development In Progress', 'Code Review', 'Ready for QA', 'Done'],
    // A day back: the newest Developer Notes update (dated today) is what Latest shows.
    comments: activityComments(now - 24 * HOUR),
    updates: activityUpdates(now - 24 * HOUR),
  };
  ctrl.workItemPaletteScenario = { ...ctrl.workItemPaletteScenario, workItems: redesignRelated() };
  const settings = canonicalSettings();
  useSettingsStore.setState({
    settings: {
      ...settings,
      azureDevOps: { ...settings.azureDevOps, organization: 'acme', project: 'portal' },
    },
    isLoading: false,
    hasLoaded: true,
  });
  useWorkItemsStore.setState({
    workItems: [bug],
    trackedWorkItemIds: new Set(),
    workingOnWorkItemIds: new Set(),
    currentUserDisplayName: 'Dana Reyes',
    fieldDefinitions: REDESIGN_FIELD_DEFS,
    workItemTypeLayouts: new Map([['Bug', REDESIGN_BUG_LAYOUT]]),
    workItemTypes: REDESIGN_TYPES,
    fieldAllowedValues: new Map([
      ['Bug|Microsoft.VSTS.Common.Severity', ['1 - Critical', '2 - Not Critical', '3 - Low']],
    ]),
    processIdResolved: true,
  });
  useDispatchStore.setState({ overview: redesignOverview(now) });
  usePrStore.setState({
    pullRequests: [
      listPr(
        {
          number: 812,
          title: "fix(schedules): show the technician's holidays in the weekly overview (AB#4127)",
          repo: 'acme/field-portal',
          checks: { total: 59 },
          mergeable: false,
        },
        now,
      ),
    ],
    closedPullRequests: [],
  });
}

function FullViewHarness() {
  useState(() => {
    const now = Date.now();
    const bug = redesignBug(now);
    seed(now, bug);
    useUiStore.setState({
      activeSection: 'workitems',
      viewStack: [{ kind: 'list' }, { kind: 'work-item-detail', id: bug.id }],
    });
    return null;
  });
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <WorkItemDetailView id={4127} />
    </div>
  );
}

function PeekHarness() {
  const [bug] = useState(() => {
    const now = Date.now();
    const item = redesignBug(now);
    seed(now, item);
    return item;
  });
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]" style={{ padding: 28 }}>
      <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 12 }}>
        ← Back · acme/field-portal #812
      </p>
      <h1 style={{ margin: '10px 0', fontSize: 20 }}>
        fix(schedules): show the technician's holidays in the weekly overview (AB#4127)
      </h1>
      <WorkItemPreview id={4127} item={bug} onClose={() => {}} />
    </div>
  );
}

function card(
  id: number,
  fields: Record<string, unknown>,
  relations: WorkItem['relations'] = [],
): WorkItem {
  return {
    id,
    rev: 1,
    url: '',
    htmlUrl: `https://dev.azure.com/acme/portal/_workitems/edit/${id}`,
    relations,
    fields: { 'System.ChangedDate': new Date(Date.now() - 4 * HOUR).toISOString(), ...fields },
  };
}

function CardsHarness() {
  const [now] = useState(() => Date.now());
  useState(() => {
    seed(now, redesignBug(now));
    return null;
  });
  const bug = redesignBug(now);
  const latest: LatestMessage = {
    source: 'notes',
    author: 'Vera',
    at: new Date(now - 26 * HOUR).toISOString(),
    text: 'Holidays now show in the Schedules weekly overview',
  };
  const pbi = card(4180, {
    'System.WorkItemType': 'Product Backlog Item',
    'System.State': 'Committed',
    'System.Title': "Planner can drag a holiday onto a technician's week",
    'System.AssignedTo': { displayName: 'Dana Reyes' },
    'System.IterationPath': 'Acme\\Sprint 23',
    'Microsoft.VSTS.Scheduling.Effort': 5,
    'System.ChangedBy': { displayName: 'Dana Reyes' },
    'System.ChangedDate': new Date(now - 50 * HOUR).toISOString(),
    'System.Description':
      "<p>As a planner I want to drop a holiday onto a technician's week so the schedule and availability update together.</p>",
  });
  const request = card(4191, {
    'System.WorkItemType': 'Customer Request',
    'System.State': 'Waiting on customer',
    'System.Title': 'Northwind: export approved holidays to the payroll CSV',
    'Microsoft.VSTS.Common.Priority': 1,
    'Microsoft.VSTS.Scheduling.DueDate': new Date(now + 2 * 24 * HOUR).toISOString(),
    'System.ChangedBy': { displayName: 'Sam Peeters' },
    'System.ChangedDate': new Date(now - 24 * HOUR).toISOString(),
    'Custom.Request':
      '<p>Hello,</p><p>Payroll needs every approved holiday per technician as a CSV each Friday, in the column order of their import.</p>',
  });
  const noDescription = card(4133, {
    'System.WorkItemType': 'Bug',
    'System.State': 'New',
    'System.Title': 'Roster export button stays disabled after login',
    'Microsoft.VSTS.Common.Priority': 3,
    'Microsoft.VSTS.Common.Severity': '3 - Low',
    'System.ChangedBy': { displayName: 'Dana Reyes' },
    'System.ChangedDate': new Date(now - 5 * HOUR).toISOString(),
    'Microsoft.VSTS.TCM.ReproSteps':
      '<ol><li>Log in as a planner.</li><li>Open Rosters → Export.</li></ol><p>The Export button stays disabled until the page is reloaded.</p>',
  });
  return (
    <div
      className="bg-[var(--color-background)]"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 384px)',
        gap: 28,
        padding: 32,
        alignItems: 'start',
        minHeight: '100vh',
      }}
    >
      <div className="bd-hover-card" style={{ width: 384 }} data-card="bug">
        <WorkItemCardView
          id={4127}
          peek={{ status: 'ready', item: bug }}
          links={[
            { key: 'pr:812', lead: '#812', label: 'checks passing · conflicts', tone: 'ok' },
            { key: 't3', lead: 'T3', label: 'your turn', tone: 'run' },
          ]}
          canOpenWeb
          latest={latest}
          now={now}
        />
      </div>
      <div className="bd-hover-card" style={{ width: 384 }} data-card="pbi">
        <WorkItemCardView
          id={4180}
          peek={{ status: 'ready', item: pbi }}
          links={[{ key: 'pr:815', lead: '#815', label: '2 failing', tone: 'fail' }]}
          canOpenWeb
          family={{
            parent: {
              id: 3980,
              type: 'Epic',
              title: 'Schedules in the new portal',
              state: 'Active',
            },
            children: { done: 3, total: 5 },
          }}
          now={now}
        />
      </div>
      <div className="bd-hover-card" style={{ width: 384 }} data-card="request">
        <WorkItemCardView
          id={4191}
          peek={{ status: 'ready', item: request }}
          links={[]}
          canOpenWeb
          latest={{
            source: 'comment',
            author: 'Sam Peeters',
            at: new Date(now - 24 * HOUR).toISOString(),
            text: 'We can send a sample import file by Thursday.',
          }}
          now={now}
        />
      </div>
      <div className="bd-hover-card" style={{ width: 384 }} data-card="repro">
        <WorkItemCardView
          id={4133}
          peek={{ status: 'ready', item: noDescription }}
          links={[]}
          canOpenWeb
          now={now}
        />
      </div>
      <div className="bd-hover-card" style={{ width: 384 }} data-card="loading">
        <WorkItemCardView id={4127} peek={{ status: 'loading' }} links={[]} canOpenWeb />
      </div>
      <div className="bd-hover-card" style={{ width: 384 }} data-card="missing">
        <WorkItemCardView id={9999} peek={{ status: 'missing' }} links={[]} canOpenWeb />
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Work Items/Redesign',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const FullView: Story = { render: () => <FullViewHarness />, globals: { theme: 'light' } };
export const FullViewDark: Story = {
  render: () => <FullViewHarness />,
  globals: { theme: 'dark' },
};
export const Peek: Story = { render: () => <PeekHarness />, globals: { theme: 'light' } };
export const PeekDark: Story = { render: () => <PeekHarness />, globals: { theme: 'dark' } };
export const HoverCards: Story = { render: () => <CardsHarness />, globals: { theme: 'light' } };
export const HoverCardsDark: Story = { render: () => <CardsHarness />, globals: { theme: 'dark' } };
