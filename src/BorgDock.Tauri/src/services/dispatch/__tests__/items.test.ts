import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@/types';
import { orderStates, sprintLabel, toDispatchItem } from '../items';
import type { WorkflowState } from '../types';

function makeWorkItem(overrides: Partial<WorkItem> & { id: number }): WorkItem {
  return {
    rev: 1,
    url: '',
    htmlUrl: '',
    relations: [],
    fields: {
      'System.WorkItemType': 'Bug',
      'System.Title': 'Search ignores accents',
      'System.State': 'New',
      'System.IterationPath': 'Shop\\Release 5\\Sprint 12',
      'System.ChangedDate': '2026-10-01T00:00:00Z',
    },
    ...overrides,
  };
}

const FLOW: WorkflowState[] = [
  { name: 'New', category: 'Proposed' },
  { name: 'Active', category: 'InProgress' },
  { name: 'Closed', category: 'Completed' },
  { name: 'Removed', category: 'Removed' },
];

describe('orderStates', () => {
  it('puts well-known names in process order whatever order ADO lists them in', () => {
    const listed: WorkflowState[] = [
      { name: 'Ready For QA', category: 'Resolved' },
      { name: 'Done', category: 'Completed' },
      { name: 'Code Review', category: 'Resolved' },
      { name: 'New', category: 'Proposed' },
      { name: 'Development In Progress', category: 'InProgress' },
    ];
    expect(orderStates(listed).map((s) => s.name)).toEqual([
      'New',
      'Development In Progress',
      'Code Review',
      'Ready For QA',
      'Done',
    ]);
  });

  it('places an unknown state at the end of its category', () => {
    const listed: WorkflowState[] = [
      { name: 'Closed', category: 'Completed' },
      { name: 'Resolved', category: 'Resolved' },
      { name: 'Active', category: 'InProgress' },
      { name: 'New', category: 'Proposed' },
    ];
    expect(orderStates(listed).map((s) => s.name)).toEqual(['New', 'Active', 'Resolved', 'Closed']);
  });
});

describe('sprintLabel', () => {
  it('takes the last segment of the iteration path', () => {
    expect(sprintLabel('Shop\\Release 5\\Sprint 12')).toBe('Sprint 12');
  });

  it('calls an item on the project root Backlog', () => {
    expect(sprintLabel('Shop')).toBe('Backlog');
    expect(sprintLabel('')).toBe('Backlog');
  });
});

describe('toDispatchItem', () => {
  it('maps the fields the engine reads', () => {
    const item = makeWorkItem({
      id: 60201,
      fields: {
        'System.WorkItemType': 'Bug',
        'System.Title': 'Search ignores accents',
        'System.State': 'Active',
        'System.IterationPath': 'Shop\\Sprint 12',
        'System.Tags': 'search; customers',
        'System.AssignedTo': { displayName: 'Ada Lovelace', uniqueName: 'ada@acme.test' },
        'System.ChangedDate': '2026-10-01T00:00:00Z',
        'Microsoft.VSTS.Common.Priority': 1,
        'Microsoft.VSTS.Scheduling.DueDate': '2026-10-14T00:00:00Z',
      },
    });
    expect(toDispatchItem(item, FLOW, true, 'https://ado/60201')).toMatchObject({
      id: 60201,
      typeName: 'Bug',
      state: 'Active',
      stateCategory: 'InProgress',
      sprint: 'Sprint 12',
      tags: ['search', 'customers'],
      assignedTo: 'Ada Lovelace',
      assignedToMe: true,
      priority: 1,
      dueDate: '2026-10-14T00:00:00Z',
      url: 'https://ado/60201',
    });
  });

  it('leaves the Removed state out of the workflow', () => {
    const converted = toDispatchItem(makeWorkItem({ id: 1 }), FLOW, true, '');
    expect(converted.states.map((s) => s.name)).toEqual(['New', 'Active', 'Closed']);
  });

  it('reads the numbers of linked GitHub pull requests', () => {
    const item = makeWorkItem({
      id: 2,
      relations: [
        {
          rel: 'ArtifactLink',
          url: 'vstfs:///GitHub/PullRequest/0f3c1e5a-1111-2222-3333-444455556666%2F3712',
          attributes: {},
        },
        { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://ado/parent', attributes: {} },
      ],
    });
    expect(toDispatchItem(item, FLOW, true, '').linkedPullRequests).toEqual([3712]);
  });
});
