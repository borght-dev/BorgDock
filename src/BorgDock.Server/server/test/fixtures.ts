import type { AdoItem, WorkflowState } from '../src/ado/client.ts';
import type { T3Thread } from '../src/t3/source.ts';

const PBI_FLOW: WorkflowState[] = [
  { name: 'New', category: 'Proposed' },
  { name: 'Development In Progress', category: 'InProgress' },
  { name: 'On Hold', category: 'InProgress' },
  { name: 'Code Review', category: 'Resolved' },
  { name: 'Ready For QA', category: 'Resolved' },
  { name: 'Done', category: 'Completed' },
];

export function item(overrides: Partial<AdoItem> & { id: number }): AdoItem {
  const states = overrides.states ?? PBI_FLOW;
  const state = overrides.state ?? 'New';
  return {
    type: 'PBI',
    typeName: 'Product Backlog Item',
    title: `Item ${overrides.id}`,
    state,
    stateCategory: states.find((s) => s.name === state)?.category ?? 'Proposed',
    workflow: states.map((s) => s.name),
    sprint: '5.2.8',
    dueDate: null,
    priority: 2,
    tags: [],
    assignedTo: 'Koen van der Borght',
    assignedToMe: true,
    url: `https://dev.azure.com/acme/Shop/_workitems/edit/${overrides.id}`,
    states,
    linkedPullRequests: [],
    pullRequestLinks: [],
    changedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function thread(overrides: Partial<T3Thread> & { id: string }): T3Thread {
  return {
    projectId: 'p-m1',
    worktree: 'M1',
    title: 'Some thread',
    branch: null,
    createdAt: '2026-10-01T08:00:00Z',
    lastActivityAt: '2026-10-02T08:00:00Z',
    open: true,
    status: 'your-turn',
    model: 'gpt-6.1-sol',
    modelInstance: 'codex',
    effort: 'high',
    pullRequests: [],
    firstUserMessage: '',
    questionRequestId: null,
    questions: [],
    lastAgentMessage: null,
    ...overrides,
  };
}

export const PROJECTS = ['M0', 'M1', 'M2'].map((title) => ({ id: `p-${title.toLowerCase()}`, title }));
